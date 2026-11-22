import clsx from 'clsx'
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react'
import { Menu, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { api, type Health } from '../lib/api'
import { EASE, SmoothScroll } from '../lib/motion'

export const NAV = [
  { to: '/lab', label: 'Live Lab', layer: 'L1-L4' },
  { to: '/analyze', label: 'Analyzer', layer: 'L2' },
  { to: '/graph', label: 'Graph', layer: 'L3' },
  { to: '/swarm', label: 'Swarm', layer: 'L5' },
  { to: '/sentinel', label: 'Sentinel', layer: 'L1' },
  { to: '/results', label: 'Results', layer: 'eval' },
  { to: '/audit', label: 'Audit', layer: 'log' },
]

function Logo() {
  return (
    <NavLink to="/" className="group flex items-center gap-2.5" aria-label="CYPHER home">
      <span className="relative grid h-7 w-7 place-items-center">
        <span className="absolute inset-0 rounded-full border border-bone/25 transition-transform duration-700 group-hover:rotate-180" style={{ borderTopColor: '#ff3b2f' }} />
        <span className="h-1.5 w-1.5 animate-pulse-slow rounded-full bg-signal shadow-[0_0_12px_#ff3b2f]" />
      </span>
      <span className="font-display text-[0.95rem] font-semibold tracking-[0.22em]">CYPHER</span>
    </NavLink>
  )
}

function StatusPill({ health }: { health: Health | null | 'down' }) {
  const ok = health && health !== 'down'
  return (
    <span className="hidden items-center gap-2 rounded-full border hairline px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-wider text-mute lg:inline-flex">
      <span className={clsx('h-1.5 w-1.5 rounded-full', ok ? 'bg-safe shadow-[0_0_8px_#3ee0c0]' : 'bg-signal')} />
      {ok ? (health as Health).backend : health === 'down' ? 'api offline' : 'connecting'}
    </span>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [health, setHealth] = useState<Health | null | 'down'>(null)
  const { pathname } = useLocation()
  const { scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 })

  useEffect(() => { api.health().then(setHealth).catch(() => setHealth('down')) }, [])
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : '' }, [open])

  return (
    <div className="grain relative min-h-dvh">
      <SmoothScroll />
      <motion.div className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-gradient-to-r from-signal via-ember to-safe" style={{ scaleX: progress }} />

      <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 md:px-6 md:pt-5">
        <motion.nav
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, ease: EASE }}
          className={clsx(
            'mx-auto flex max-w-7xl items-center justify-between rounded-full px-4 py-2.5 transition-all duration-500 md:px-6',
            scrolled ? 'border hairline bg-ink/70 shadow-[0_20px_50px_-20px_rgba(0,0,0,.9)] backdrop-blur-xl' : 'border border-transparent',
          )}
        >
          <Logo />
          <div className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className="relative rounded-full px-3.5 py-2 text-sm text-bone-2 transition-colors hover:text-bone">
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-white/[0.07]" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                    <span className={clsx('relative', isActive && 'text-bone')}>{n.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <StatusPill health={health} />
            <button className="grid h-10 w-10 place-items-center rounded-full border hairline md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={18} />
            </button>
          </div>
        </motion.nav>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 bg-ink/95 backdrop-blur-2xl md:hidden" initial={{ clipPath: 'circle(0% at 92% 4%)' }} animate={{ clipPath: 'circle(150% at 92% 4%)' }} exit={{ clipPath: 'circle(0% at 92% 4%)' }} transition={{ duration: 0.7, ease: EASE }}>
            <div className="flex items-center justify-between px-6 pt-6">
              <Logo />
              <button className="grid h-10 w-10 place-items-center rounded-full border hairline" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
            </div>
            <nav className="mt-10 flex flex-col px-6">
              {NAV.map((n, i) => (
                <motion.div key={n.to} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.05, duration: 0.6, ease: EASE }}>
                  <NavLink to={n.to} className="flex items-baseline justify-between border-b hairline py-4">
                    <span className="font-display text-3xl">{n.label}</span>
                    <span className="font-mono text-xs text-mute">{n.layer}</span>
                  </NavLink>
                </motion.div>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.main key={pathname} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.6, ease: EASE }}>
          {children}
        </motion.main>
      </AnimatePresence>

      <footer className="relative mt-32 overflow-hidden border-t hairline">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-10">
          <div>
            <Logo />
            <p className="mt-5 max-w-sm font-serif text-lg leading-snug text-bone-2">Moderation that understands relationships, asks the person who was hurt, and learns without reading your chats.</p>
          </div>
          <div>
            <div className="eyebrow mb-4">Explore</div>
            <div className="grid grid-cols-2 gap-2 text-sm text-bone-2">
              {NAV.map((n) => <NavLink key={n.to} to={n.to} className="hover:text-bone">{n.label}</NavLink>)}
            </div>
          </div>
          <div>
            <div className="eyebrow mb-4">Project</div>
            <p className="text-sm leading-relaxed text-bone-2">Department of Information Technology<br />Institute of Engineering &amp; Management, Kolkata<br />Final year project</p>
          </div>
        </div>
        <div aria-hidden className="pointer-events-none select-none px-5 pb-4 text-center font-display text-[22vw] font-bold leading-[0.8] tracking-tighter text-outline md:px-10">CYPHER</div>
      </footer>
    </div>
  )
}
