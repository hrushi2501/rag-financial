from benchmarks.run_retrieval import percentile, relevant


def test_percentile_interpolates_sorted_values():
    assert percentile([40, 10, 30, 20], 0.5) == 25


def test_relevance_requires_document_and_overlapping_page():
    expected = [{"document_id": "doc_a", "pages": [12, 13]}]
    assert relevant({"document_id": "doc_a", "page_start": 11, "page_end": 12}, expected)
    assert not relevant({"document_id": "doc_a", "page_start": 14, "page_end": 15}, expected)
    assert not relevant({"document_id": "doc_b", "page_start": 12, "page_end": 12}, expected)
