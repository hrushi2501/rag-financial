"""Embedding boundary with lazy, batched FinBERT loading."""

from __future__ import annotations

from typing import Protocol


class Embedder(Protocol):
    dimension: int
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class FinBERTEmbedder:
    def __init__(self, model_name: str = "ProsusAI/finbert", dimension: int = 768, batch_size: int = 64):
        self.model_name = model_name
        self.dimension = dimension
        self.batch_size = batch_size
        self._model = None

    def _load(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer, models

            transformer = models.Transformer(self.model_name, do_lower_case=True)
            pooling = models.Pooling(
                word_embedding_dimension=transformer.get_word_embedding_dimension(),
                pooling_mode_mean_tokens=True,
                pooling_mode_cls_token=False,
                pooling_mode_max_tokens=False,
            )
            self._model = SentenceTransformer(modules=[transformer, pooling])
        return self._model

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        vectors = self._load().encode(
            texts, batch_size=self.batch_size, normalize_embeddings=True, show_progress_bar=False
        )
        return vectors.tolist() if hasattr(vectors, "tolist") else list(vectors)

    @property
    def loaded(self) -> bool:
        return self._model is not None
