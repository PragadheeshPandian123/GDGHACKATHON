"""
Lost and Found AI Similarity Matcher
Fetches data from Firestore and Cloudinary for matching
"""

from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer
from PIL import Image
import numpy as np
import requests
from io import BytesIO
import firebase_admin
from firebase_admin import credentials, firestore
import os
import json

app = Flask(__name__)

# Initialize Firebase
# try:
#     cred = credentials.Certificate('serviceAccountKey.json')
#     firebase_admin.initialize_app(cred)
#     db = firestore.client()
#     print("Firebase initialized successfully!")
# except Exception as e:
#     print(f"Firebase initialization error: {e}")
#     db = None

try:
    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT")

    if not service_account_json:
        raise Exception("FIREBASE_SERVICE_ACCOUNT env variable not set")

    cred_dict = json.loads(service_account_json)
    cred = credentials.Certificate(cred_dict)

    firebase_admin.initialize_app(cred)
    db = firestore.client()

    print("Firebase initialized successfully via ENV!")

except Exception as e:
    print(f"Firebase initialization error: {e}")
    db = None

# Initialize models
print("Loading models...")
text_model = SentenceTransformer('all-MiniLM-L6-v2')
image_model = SentenceTransformer('clip-ViT-B-32')
print("Models loaded successfully!")
print("Python AI URL:", os.getenv("PYTHON_AI_URL"))

# Configuration
TEXT_WEIGHT = 0.3
IMAGE_WEIGHT = 0.7


def load_image_from_url(url):
    """Load image from Cloudinary URL."""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        img = Image.open(BytesIO(response.content)).convert('RGB')
        return img
    except Exception as e:
        print(f"Error loading image from {url}: {e}")
        return None


def cosine_similarity(vec1, vec2):
    """Calculate cosine similarity between two vectors."""
    dot_product = np.dot(vec1, vec2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    return (dot_product / (norm1 * norm2)) if (norm1 * norm2) > 0 else 0


def get_text_embedding(text):
    """Generate embedding for text."""
    if not text or not text.strip():
        return None
    return text_model.encode(text, convert_to_tensor=False)


def get_image_embedding(img):
    """Generate embedding for PIL Image."""
    try:
        return image_model.encode(img, convert_to_tensor=False)
    except Exception as e:
        print(f"Error processing image: {e}")
        return None


def fetch_items_from_firestore(collection_name):
    """Fetch all items from a Firestore collection."""
    if db is None:
        return []
    
    items = []
    try:
        docs = db.collection(collection_name).stream()
        
        for doc in docs:
            data = doc.to_dict()
            items.append({
                'id': doc.id,
                'description': data.get('description', ''),
                'image_url': data.get('imageUrl') or data.get('image_url'),
                'metadata': {
                    'location': data.get('location'),
                    'date': data.get('date'),
                    'category': data.get('category'),
                    'contactInfo': data.get('contactInfo'),
                    **data.get('metadata', {})
                }
            })
    except Exception as e:
        print(f"Error fetching from Firestore collection '{collection_name}': {e}")
    
    return items


def calculate_similarity(query_text, query_img, target_item):
    """Calculate similarity between query and target item."""
    text_sim = 0
    image_sim = 0
    has_text = False
    has_image = False
    
    # Text similarity
    if query_text and target_item.get('description'):
        query_text_emb = get_text_embedding(query_text)
        target_text_emb = get_text_embedding(target_item['description'])
        
        if query_text_emb is not None and target_text_emb is not None:
            text_sim = cosine_similarity(query_text_emb, target_text_emb)
            has_text = True
    
    # Image similarity
    if query_img is not None and target_item.get('image_url'):
        query_img_emb = get_image_embedding(query_img)
        target_img = load_image_from_url(target_item['image_url'])
        
        if target_img is not None:
            target_img_emb = get_image_embedding(target_img)
            
            if query_img_emb is not None and target_img_emb is not None:
                image_sim = cosine_similarity(query_img_emb, target_img_emb)
                has_image = True
    
    # Calculate combined score
    if has_text and has_image:
        combined_score = (TEXT_WEIGHT * text_sim) + (IMAGE_WEIGHT * image_sim)
    elif has_text:
        combined_score = text_sim
    elif has_image:
        combined_score = image_sim
    else:
        combined_score = 0
    
    score_percentage = float(combined_score * 100)
    
    return {
        'overall_score': round(score_percentage, 2),
        'text_similarity': round(float(text_sim * 100), 2) if has_text else None,
        'image_similarity': round(float(image_sim * 100), 2) if has_image else None,
        'has_text': has_text,
        'has_image': has_image
    }


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    firebase_status = 'connected' if db is not None else 'disconnected'
    return jsonify({
        'status': 'healthy',
        'message': 'Lost and Found AI Matcher is running',
        'firebase': firebase_status,
        'models_loaded': True
    })


@app.route('/match', methods=['POST'])
def match_items():
    """
    Match a lost/found item against items in Firestore.
    
    Form-data fields:
    - type: "lost" or "found" (required)
    - text: description (required)
    - image: image file (optional)
    
    OR JSON body:
    {
        "type": "lost" or "found",
        "text": "description",
        "imageUrl": "cloudinary_url" (optional)
    }
    """
    try:
        if db is None:
            return jsonify({'error': 'Firebase not initialized'}), 500
        
        # Handle both form-data and JSON
        if request.is_json:
            data = request.get_json()
            query_type = data.get('type', '').lower()
            query_text = data.get('text', '').strip()
            image_url = data.get('imageUrl')
            
            # Load image from URL if provided
            query_img = None
            if image_url:
                query_img = load_image_from_url(image_url)
        else:
            # Form-data with file upload
            query_type = request.form.get('type', '').lower()
            query_text = request.form.get('text', '').strip()
            
            # Process uploaded image if provided
            query_img = None
            if 'image' in request.files:
                image_file = request.files['image']
                if image_file and image_file.filename:
                    try:
                        query_img = Image.open(image_file).convert('RGB')
                    except Exception as e:
                        print(f"Error loading image: {e}")
        
        # Validation
        if not query_type or query_type not in ['lost', 'found']:
            return jsonify({'error': 'type must be "lost" or "found"'}), 400
        
        if not query_text:
            return jsonify({'error': 'text description is required'}), 400
        
        # Determine which collection to search
        # If looking for a lost item, search in found items and vice versa
        search_collection = 'found_items' if query_type == 'lost' else 'lost_items'
        
        # Fetch items from Firestore
        target_items = fetch_items_from_firestore(search_collection)
        
        if not target_items:
            return jsonify({
                'message': f'No items found in {search_collection} collection',
                'matches': []
            })
        
        # Calculate similarities
        results = []
        for target in target_items:
            similarity = calculate_similarity(query_text, query_img, target)
            
            results.append({
                'item_id': target['id'],
                'similarity': similarity,
                'description': target['description'][:100] + '...' if len(target['description']) > 100 else target['description'],
                'metadata': target['metadata'],
                'has_image': target['image_url'] is not None,
                'image_url': target['image_url']
            })
        
        # Sort by overall score
        results.sort(key=lambda x: x['similarity']['overall_score'], reverse=True)
        
        # Return top matches (you can add a limit parameter if needed)
        return jsonify({
            'query_type': query_type,
            'searched_in': search_collection,
            'total_items': len(results),
            'matches': results[:20]  # Return top 20 matches
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("""
    ========================================
    Lost and Found AI Similarity Matcher
    ========================================
    
    Fetches data from Firestore and Cloudinary
    
    Endpoints:
    - GET  /health    - Health check
    - POST /match     - Match items (form-data or JSON)
    
    Firestore Collections:
    - lost_items      - Items that people have lost
    - found_items     - Items that people have found
    
    Match Logic:
    - Query with type="lost" searches in found_items
    - Query with type="found" searches in lost_items
    
    ========================================
    """)
    
    app.run(debug=True, host='0.0.0.0', port=5000)