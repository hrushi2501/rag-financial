"""Financial-document-aware, page-preserving chunking."""

from __future__ import annotations

import re
from hashlib import sha256
from typing import Callable

try:
    from .models import FinancialChunk, PageContent
except ImportError:  # pragma: no cover
    from models import FinancialChunk, PageContent


def approximate_token_count(text: str) -> int:
    # Stable dependency-free approximation. Production embedding workers may
    # inject the model tokenizer for exact counts.
    return max(1, len(re.findall(r"\w+|[^\w\s]", text)))


class FinancialChunker:
    def __init__(
        self,
        max_tokens: int = 400,
        overlap_tokens: int = 40,
        token_counter: Callable[[str], int] = approximate_token_count,
    ):
        if max_tokens < 50 or overlap_tokens < 0 or overlap_tokens >= max_tokens:
            raise ValueError("invalid chunk size or overlap")
        self.max_tokens = max_tokens
        self.overlap_tokens = overlap_tokens
        self.count_tokens = token_counter

    def chunk(
        self, pages: list[PageContent], document_id: str, filename: str, metadata: dict | None = None
    ) -> list[FinancialChunk]:
        document_metadata = metadata or {}
        output: list[FinancialChunk] = []
        chunk_index = 0
        for page in pages:
            section = None
            current: list[str] = []
            header = self._context_header(document_metadata, filename, page.page_number)
            source_budget = max(20, self.max_tokens - self.count_tokens(header))
            blocks = [part for block in self._blocks(page.text) for part in self._split_block(block, source_budget)]
            for block in blocks:
                if block.lstrip().startswith("#"):
                    section = block.lstrip("# ").strip()[:240]
                candidate = "\n\n".join(current + [block])
                if current and self.count_tokens(candidate) > source_budget:
                    output.append(
                        self._make_chunk(
                            current, page, section, document_id, filename, document_metadata, chunk_index
                        )
                    )
                    chunk_index += 1
                    current = self._overlap(current)
                    if current and self.count_tokens("\n\n".join(current + [block])) > source_budget:
                        current = []
                current.append(block)
            if current:
                output.append(
                    self._make_chunk(current, page, section, document_id, filename, document_metadata, chunk_index)
                )
                chunk_index += 1
        return output

    @staticmethod
    def _context_header(metadata: dict, filename: str, page_number: int) -> str:
        context = " | ".join(
            str(value)
            for value in (metadata.get("ticker"), metadata.get("report_name") or filename, f"Page {page_number}")
            if value
        )
        return f"[{context}]" if context else ""

    def _split_block(self, block: str, budget: int) -> list[str]:
        if self.count_tokens(block) <= budget:
            return [block]
        lines = [line for line in block.splitlines() if line.strip()]
        if len(lines) >= 2 and all("|" in line for line in lines):
            return self._split_table(lines, budget)

        sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", block) if part.strip()]
        pieces: list[str] = []
        current = ""
        for sentence in sentences:
            for part in self._split_words(sentence, budget):
                candidate = f"{current} {part}".strip()
                if current and self.count_tokens(candidate) > budget:
                    pieces.append(current)
                    current = part
                else:
                    current = candidate
        if current:
            pieces.append(current)
        return pieces

    def _split_table(self, lines: list[str], budget: int) -> list[str]:
        header_count = 2 if len(lines) > 1 and re.search(r"-{3,}", lines[1]) else 1
        header = lines[:header_count]
        rows = lines[header_count:]
        groups: list[str] = []
        current = list(header)
        for row in rows:
            candidate = "\n".join(current + [row])
            if len(current) > header_count and self.count_tokens(candidate) > budget:
                groups.append("\n".join(current))
                current = list(header)
            if self.count_tokens("\n".join(current + [row])) > budget:
                # Pathological prose-like cells are split only as a last resort;
                # normal financial rows stay intact and repeat the table header.
                for part in self._split_words(row, max(10, budget - self.count_tokens("\n".join(header)))):
                    groups.append("\n".join(header + [part]))
            else:
                current.append(row)
        if len(current) > header_count or not groups:
            groups.append("\n".join(current))
        return groups

    def _split_words(self, text: str, budget: int) -> list[str]:
        words = text.split()
        parts: list[str] = []
        current: list[str] = []
        for word in words:
            if current and self.count_tokens(" ".join(current + [word])) > budget:
                parts.append(" ".join(current))
                current = []
            current.append(word)
        if current:
            parts.append(" ".join(current))
        return parts or [text]

    @staticmethod
    def _blocks(text: str) -> list[str]:
        lines = text.splitlines()
        blocks: list[str] = []
        paragraph: list[str] = []
        table: list[str] = []

        def flush(target: list[str]) -> None:
            if target:
                blocks.append("\n".join(target).strip())
                target.clear()

        for line in lines:
            is_table = "|" in line and bool(line.strip())
            if is_table:
                flush(paragraph)
                table.append(line)
            else:
                flush(table)
                if not line.strip():
                    flush(paragraph)
                else:
                    paragraph.append(line)
        flush(table)
        flush(paragraph)
        return [block for block in blocks if block]

    def _overlap(self, blocks: list[str]) -> list[str]:
        kept: list[str] = []
        tokens = 0
        for block in reversed(blocks):
            size = self.count_tokens(block)
            if kept and tokens + size > self.overlap_tokens:
                break
            kept.insert(0, block)
            tokens += size
        return kept

    def _make_chunk(
        self,
        blocks: list[str],
        page: PageContent,
        section: str | None,
        document_id: str,
        filename: str,
        metadata: dict,
        chunk_index: int,
    ) -> FinancialChunk:
        source = "\n\n".join(blocks).strip()
        header = self._context_header(metadata, filename, page.page_number)
        text = f"{header}\n{source}" if header else source
        stable = sha256(f"{document_id}:{page.page_number}:{chunk_index}:{source}".encode()).hexdigest()[:24]
        return FinancialChunk(
            chunk_id=f"chk_{stable}",
            text=text,
            source_text=source,
            page_start=page.page_number,
            page_end=page.page_number,
            section=section,
            token_count=self.count_tokens(text),
            metadata={**metadata, "document_id": document_id, "filename": filename, "chunk_index": chunk_index},
        )
