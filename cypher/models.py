"""Layer 2 neural architectures.

HybridTransformerCNN follows Section III-B of the paper:
  contextual embeddings E (L x d) from a transformer encoder
  -> 1D convolutions with kernel sizes h in {2,3,4} (n-gram detectors)
  -> global max pooling  c_hat = max(c)
  -> concat with the [CLS] vector -> dropout -> linear -> softmax
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import AutoModel


class HybridTransformerCNN(nn.Module):
    def __init__(self, encoder_name: str, kernel_sizes=(2, 3, 4), n_filters=128, dropout=0.3, use_cnn=True):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(encoder_name)
        hidden = self.encoder.config.hidden_size
        self.use_cnn = use_cnn
        if use_cnn:
            self.convs = nn.ModuleList(nn.Conv1d(hidden, n_filters, k, padding=k // 2) for k in kernel_sizes)
            feat_dim = hidden + n_filters * len(kernel_sizes)
        else:
            self.convs = nn.ModuleList()
            feat_dim = hidden
        self.dropout = nn.Dropout(dropout)
        self.classifier = nn.Linear(feat_dim, 2)

    def forward(self, input_ids, attention_mask):
        hidden = self.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        cls = hidden[:, 0]
        if not self.use_cnn:
            return self.classifier(self.dropout(cls))

        x = hidden.transpose(1, 2)  # (B, d, L)
        mask = attention_mask.unsqueeze(1).bool()
        pooled = []
        for conv in self.convs:
            c = F.relu(conv(x))[:, :, : x.size(2)]
            c = c.masked_fill(~mask, -1e4)  # ignore padding when pooling
            pooled.append(c.max(dim=2).values)
        feats = torch.cat([cls] + pooled, dim=1)
        return self.classifier(self.dropout(feats))


class BiLSTMAttention(nn.Module):
    """Baseline from Table I: BiLSTM with additive attention over trainable embeddings."""

    def __init__(self, vocab_size, emb_dim=200, hidden=128, dropout=0.3):
        super().__init__()
        self.emb = nn.Embedding(vocab_size, emb_dim, padding_idx=0)
        self.lstm = nn.LSTM(emb_dim, hidden, batch_first=True, bidirectional=True)
        self.att = nn.Linear(hidden * 2, 1)
        self.dropout = nn.Dropout(dropout)
        self.out = nn.Linear(hidden * 2, 2)

    def forward(self, ids):
        mask = ids != 0
        h, _ = self.lstm(self.emb(ids))
        scores = self.att(h).squeeze(-1).masked_fill(~mask, -1e4)
        w = torch.softmax(scores, dim=1).unsqueeze(-1)
        ctx = (h * w).sum(1)
        return self.out(self.dropout(ctx))
