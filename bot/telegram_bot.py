"""CYPHER moderation bot for Telegram groups.

Every group message is sent to the CYPHER API, which decides:
  allow   -> nothing happens
  block   -> the message is deleted and a short notice is posted
  verify  -> the person being replied to gets a PRIVATE message from the bot
             ("Was that okay?") with buttons; "Not okay" hides the message,
             collapses trust and creates a differentially private update.

Run (with the API already running on port 8000):
    python -m bot.telegram_bot

Setup is described in README.md -> "Telegram bot".
"""

import html
import logging
import os
import sys
from pathlib import Path

import httpx
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, User
from telegram.constants import ParseMode
from telegram.error import TelegramError
from telegram.ext import (Application, CallbackQueryHandler, CommandHandler, ContextTypes, MessageHandler,
                          filters)

ROOT = Path(__file__).resolve().parent.parent
log = logging.getLogger("cypher.telegram")


def load_dotenv(path: Path = ROOT / ".env"):
    """Minimal .env reader so the bot needs no extra dependency."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv()
API = os.getenv("CYPHER_API_URL", "http://127.0.0.1:8000").rstrip("/")
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")


def name_of(user: User) -> str:
    return (user.username or f"{user.first_name}_{user.id}").lower().replace(" ", "_")[:40]


async def api(context: ContextTypes.DEFAULT_TYPE, method: str, path: str, json=None) -> dict:
    client: httpx.AsyncClient = context.application.bot_data["http"]
    r = await client.request(method, API + path, json=json)
    r.raise_for_status()
    return r.json()


# ---------------------------------------------------------------- commands
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_message.reply_text(
        "👋 I'm the CYPHER safety bot.\n\n"
        "Add me to a group (as admin) and I will:\n"
        "• quietly remove clearly abusive messages,\n"
        "• privately ask you if a borderline reply to you was okay,\n"
        "• learn the difference between friendly banter and bullying.\n\n"
        "Because you pressed /start, I can now message you privately when needed.\n"
        "Try /check <message> to see how a message would be scored."
    )


async def check(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = " ".join(context.args) if context.args else ""
    if not text and update.effective_message.reply_to_message:
        text = update.effective_message.reply_to_message.text or ""
    if not text:
        await update.effective_message.reply_text("Usage: /check <message>  (or reply to a message with /check)")
        return
    try:
        a = await api(context, "POST", "/api/analyze", {"text": text})
    except httpx.HTTPError:
        await update.effective_message.reply_text("⚠️ CYPHER API is not reachable.")
        return
    top = sorted((t for t in a["explanation"] if t["weight"] > 0.05), key=lambda t: -t["weight"])[:3]
    icon = {"clean": "🟢", "borderline": "🟡", "toxic": "🔴"}[a["verdict"]]
    lines = [f"{icon} <b>{a['verdict'].upper()}</b>  ·  toxicity {a['score'] * 100:.0f}%"]
    if top:
        lines.append("Driven by: " + ", ".join(f"<i>{html.escape(t['token'])}</i>" for t in top))
    if a["sentinel"]["obfuscated"]:
        lines.append(f"Decoded as: <code>{html.escape(a['sentinel']['normalized'])}</code>")
    if a["sentinel"]["hits"]:
        lines.append("Slang: " + ", ".join(h["term"] for h in a["sentinel"]["hits"]))
    await update.effective_message.reply_text("\n".join(lines), parse_mode=ParseMode.HTML)


# ---------------------------------------------------------------- group messages
async def on_group_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    msg = update.effective_message
    if not msg or not msg.text or not msg.from_user or msg.from_user.is_bot:
        return

    sender = name_of(msg.from_user)
    target_user = msg.reply_to_message.from_user if msg.reply_to_message and msg.reply_to_message.from_user else None
    if target_user and (target_user.is_bot or target_user.id == msg.from_user.id):
        target_user = None
    recipient = name_of(target_user) if target_user else "group"
    room = f"tg{msg.chat.id}"

    try:
        d = await api(context, "POST", "/api/messages",
                      {"room": room, "sender": sender, "recipient": recipient, "text": msg.text[:2000]})
    except httpx.HTTPError as exc:
        log.warning("API call failed: %s", exc)
        return
    log.info("%s -> %s | %s L%s P=%.2f", sender, recipient, d["action"], d["layer"], d["score"])

    if d["action"] == "block":
        try:
            await msg.delete()
            await context.bot.send_message(
                msg.chat.id,
                f"🛡️ A message from <b>{html.escape(msg.from_user.first_name)}</b> was removed "
                f"({html.escape(d['reason'].lower())}).",
                parse_mode=ParseMode.HTML)
        except TelegramError:
            await msg.reply_text("⚠️ This message looks abusive. (Make me an admin so I can remove it.)")

    elif d["action"] == "verify" and target_user:
        context.application.bot_data.setdefault("pending", {})[d["message_id"]] = (msg.chat.id, msg.message_id)
        buttons = InlineKeyboardMarkup([[
            InlineKeyboardButton("👍 It's fine", callback_data=f"v:{d['message_id']}:0"),
            InlineKeyboardButton("👎 Not okay", callback_data=f"v:{d['message_id']}:1"),
        ]])
        try:
            await context.bot.send_message(
                target_user.id,
                f"🔒 <b>Only you can see this.</b>\n\n"
                f"In <b>{html.escape(msg.chat.title or 'a group')}</b>, "
                f"{html.escape(msg.from_user.first_name)} replied to you:\n"
                f"“{html.escape(msg.text[:300])}”\n\nWas that okay with you?",
                parse_mode=ParseMode.HTML, reply_markup=buttons)
        except TelegramError:
            # Telegram only lets bots message people who have opened a private chat with them first
            log.info("could not DM %s - they need to press /start in a private chat with the bot", recipient)


async def on_verify(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    try:
        _, mid, flag = q.data.split(":")
        r = await api(context, "POST", f"/api/messages/{int(mid)}/verify", {"flagged": flag == "1"})
    except (ValueError, httpx.HTTPError):
        await q.edit_message_text("⚠️ Could not reach CYPHER right now. Please try again later.")
        return

    if r.get("already_resolved"):
        await q.edit_message_text("You already answered this one. Thank you.")
        return
    pending = context.application.bot_data.get("pending", {})
    if r["status"] == "flagged":
        chat_msg = pending.pop(int(mid), None)
        if chat_msg:
            try:
                await context.bot.delete_message(*chat_msg)
            except TelegramError:
                pass
        await q.edit_message_text("Thank you for telling us. 💙\nThe message has been hidden and this person's "
                                  "messages to you will be checked more strictly. They will not be told.")
    else:
        pending.pop(int(mid), None)
        await q.edit_message_text("Got it 👍 CYPHER will remember that this kind of banter is fine between you two.")


# ---------------------------------------------------------------- app
async def on_startup(app: Application):
    app.bot_data["http"] = httpx.AsyncClient(timeout=20)
    try:
        h = (await app.bot_data["http"].get(API + "/api/health")).json()
        log.info("connected to CYPHER API (%s)", h.get("backend"))
    except httpx.HTTPError:
        log.warning("CYPHER API not reachable at %s - start it with: uvicorn backend.main:app --port 8000", API)
    me = await app.bot.get_me()
    log.info("bot running as @%s - add it to a group and make it admin", me.username)


async def on_shutdown(app: Application):
    await app.bot_data["http"].aclose()


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    if not TOKEN:
        print("TELEGRAM_BOT_TOKEN is not set.\n"
              "1. Talk to @BotFather on Telegram, send /newbot and copy the token.\n"
              "2. Put this line in a file called .env in the project folder:\n"
              "   TELEGRAM_BOT_TOKEN=123456:ABC...\n"
              "See README.md -> 'Telegram bot' for the full steps.")
        sys.exit(1)

    app = Application.builder().token(TOKEN).post_init(on_startup).post_shutdown(on_shutdown).build()
    app.add_handler(CommandHandler(["start", "help"], start, filters=filters.ChatType.PRIVATE))
    app.add_handler(CommandHandler("check", check))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND & filters.ChatType.GROUPS, on_group_message))
    app.add_handler(CallbackQueryHandler(on_verify, pattern=r"^v:\d+:[01]$"))
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
