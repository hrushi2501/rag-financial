"""
Temporary script to flush the Pinecone index (delete all vectors).
Use with caution: This wipes the entire index contents or the selected namespace.
"""

import sys
from config import (
    PINECONE_API_KEY, PINECONE_INDEX_NAME, PINECONE_CLOUD, PINECONE_REGION
)
from pinecone import Pinecone


def main(namespace: str | None = None):
    if not PINECONE_API_KEY:
        print("PINECONE_API_KEY is not set in config/.env. Aborting.")
        sys.exit(1)
    if not PINECONE_INDEX_NAME:
        print("PINECONE_INDEX_NAME is not configured. Aborting.")
        sys.exit(1)

    print(f"Connecting to Pinecone index '{PINECONE_INDEX_NAME}'...")
    pc = Pinecone(api_key=PINECONE_API_KEY)
    index = pc.Index(PINECONE_INDEX_NAME)

    if namespace:
        print(f"Deleting ALL vectors in namespace='{namespace}'...")
        index.delete(deleteAll=True, namespace=namespace)
    else:
        print("Deleting ALL vectors in the default namespace (entire index contents)...")
        index.delete(deleteAll=True)

    print("✓ Delete request submitted. Depending on size, propagation may take a moment.")


if __name__ == "__main__":
    ns = None
    if len(sys.argv) > 1 and sys.argv[1].strip():
        ns = sys.argv[1].strip()
    main(ns)
