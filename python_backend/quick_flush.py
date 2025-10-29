"""Quick script to flush Pinecone - run this once"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from config import PINECONE_API_KEY, PINECONE_INDEX_NAME
from pinecone import Pinecone

if __name__ == "__main__":
    if not PINECONE_API_KEY:
        print("PINECONE_API_KEY not set")
        sys.exit(1)
    
    print(f"🔌 Connecting to Pinecone index '{PINECONE_INDEX_NAME}'...")
    pc = Pinecone(api_key=PINECONE_API_KEY)
    index = pc.Index(PINECONE_INDEX_NAME)
    
    print("Deleting ALL vectors from Pinecone...")
    index.delete(delete_all=True)
    print("All vectors deleted from Pinecone index!")
    print("The index is now empty. Upload new documents to add vectors.")
