// ============================================
// server.js - Production-Ready with Direct Cloudinary Upload
// ============================================

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');


require("dotenv").config();

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// Cloudinary Configuration
// ============================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ============================================
// Firebase Admin Setup
// ============================================

// ============================================
// Firebase Admin Setup (Render-safe)
// ============================================

let serviceAccount;

try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (err) {
  console.error("❌ Failed to load FIREBASE_SERVICE_ACCOUNT");
  throw err;
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();


// ============================================
// Gemini AI Setup
// ============================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ============================================
// File Upload Configuration (Memory Storage)
// ============================================

// Use memory storage - no files written to disk
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, webp)'));
    }
  }
});

// ============================================
// Python AI Server Configuration
// ============================================

const PYTHON_AI_SERVER = process.env.PYTHON_SERVER || 'http://127.0.0.1:5000';

// ============================================
// Cloudinary Helper Functions
// ============================================

/**
 * Upload image buffer to Cloudinary (no temp files)
 * @param {Buffer} fileBuffer - Image buffer from multer
 * @param {string} folder - Cloudinary folder name
 * @param {string} publicId - Optional public ID
 * @returns {Promise<Object>} Cloudinary upload response
 */
async function uploadToCloudinary(fileBuffer, folder = 'uploads', publicId = null) {
  return new Promise((resolve, reject) => {
    const options = {
      folder: folder,
      resource_type: 'auto',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    };

    if (publicId) {
      options.public_id = publicId;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(new Error('Failed to upload image to Cloudinary'));
        } else {
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format
          });
        }
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
}

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Deletion result
 */
async function deleteFromCloudinary(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error('Failed to delete image from Cloudinary');
  }
}

/**
 * Download image from Cloudinary for Python AI processing
 * @param {string} imageUrl - Cloudinary image URL
 * @returns {Promise<Buffer>} Image buffer
 */
async function downloadImageBuffer(imageUrl) {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (error) {
    console.error('Image download error:', error);
    throw new Error('Failed to download image for AI processing');
  }
}

// ============================================
// Middleware: Verify Firebase Token
// ============================================

const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ============================================
// Helper Functions
// ============================================

// Generate structured keywords using Gemini AI
async function generateStructuredKeywords(description) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    const prompt = `Extract key attributes from this lost/found item description and return them as a JSON object with the following structure:
{
  "keywords": ["keyword1", "keyword2", ...],
  "color": "color if mentioned",
  "category": "item category (e.g., wallet, phone, bag)",
  "brand": "brand if mentioned",
  "distinctive_features": ["feature1", "feature2"]
}

Description: ${description}

Return ONLY the JSON object, no additional text.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return {
      keywords: description.toLowerCase().split(' ').filter(w => w.length > 3),
      color: null,
      category: null,
      brand: null,
      distinctive_features: []
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    return {
      keywords: description.toLowerCase().split(' ').filter(w => w.length > 3),
      color: null,
      category: null,
      brand: null,
      distinctive_features: []
    };
  }
}

// Call Python AI server for similarity matching
async function callPythonAI(itemData, itemType) {
  try {
    const formData = new FormData();
    formData.append('type', itemType);
    formData.append('text', itemData.description);
    
    // Download image from Cloudinary as buffer and send to Python AI
    if (itemData.imageUrl) {
      const imageBuffer = await downloadImageBuffer(itemData.imageUrl);
      formData.append('image', imageBuffer, {
        filename: 'image.jpg',
        contentType: 'image/jpeg'
      });
    }
    
    const response = await axios.post(`${PYTHON_AI_SERVER}/match`, formData, {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });
    
    return response.data;
  } catch (error) {
    console.error('Python AI server error:', error.message);
    throw new Error('Failed to get AI match results');
  }
}



// Store matches in Firestore
async function storeMatches(itemId, itemType, matches) {
  try {
    const batch = db.batch();
    
    for (const match of matches) {
      const matchRef = db.collection('matches').doc();
      const matchData = {
        lost_item_id: itemType === 'lost' ? itemId : match.item_id,
        found_item_id: itemType === 'found' ? itemId : match.item_id,
        similarity_score: match.similarity.overall_score,
        text_score: match.similarity.text_similarity,
        image_score: match.similarity.image_similarity,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      };
      
      batch.set(matchRef, matchData);
    }
    
    await batch.commit();
  } catch (error) {
    console.error('Error storing matches:', error);
  }
}

// Create notification for user
async function createNotification(userId, message, itemId, matchId) {
  try {
    await db.collection('notifications').add({
      user_id: userId,
      message: message,
      item_id: itemId,
      match_id: matchId,
      read: false,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

// ============================================
// ROUTES - Authentication & User Management
// ============================================

// Register/Update User Profile
app.post('/api/users/register', verifyToken, async (req, res) => {
  try {
    const { name, phone, role } = req.body;
    const uid = req.user.uid;
    
    const userData = {
      uid: uid,
      name: name || req.user.name || '',
      email: req.user.email,
      phone: phone || '',
      role: role || 'user',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('users').doc(uid).set(userData, { merge: true });
    
    res.json({
      message: 'User profile updated successfully',
      user: userData
    });
  } catch (error) {
    console.error('User registration error:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// Get User Profile
app.get('/api/users/profile', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    res.json({
      user: userDoc.data()
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// ============================================
// ROUTES - Lost Items
// ============================================

// Report Lost Item
app.post('/api/lost-items', verifyToken, upload.single('image'), async (req, res) => {
  try {
    const { name, description, date_lost, location_lat, location_lng } = req.body;
    const userId = req.user.uid;
    
    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }
    
    // Upload image to Cloudinary if provided (directly from buffer)
    let cloudinaryData = null;
    if (req.file) {
      cloudinaryData = await uploadToCloudinary(
        req.file.buffer,
        'lost_items',
        `lost_${userId}_${Date.now()}`
      );
    }
    
    // Generate structured keywords using Gemini AI
    const structuredData = await generateStructuredKeywords(description);
    
    // Prepare item data
    const itemData = {
      user_id: userId,
      name: name,
      description: description,
      image_url: cloudinaryData ? cloudinaryData.url : null,
      image_public_id: cloudinaryData ? cloudinaryData.public_id : null,
      image_metadata: cloudinaryData ? {
        width: cloudinaryData.width,
        height: cloudinaryData.height,
        format: cloudinaryData.format
      } : null,
      structured_keywords: structuredData.keywords || [],
      color: structuredData.color,
      category: structuredData.category,
      brand: structuredData.brand,
      distinctive_features: structuredData.distinctive_features || [],
      date_lost: date_lost || new Date().toISOString(),
      location: {
        lat: parseFloat(location_lat) || 0,
        lng: parseFloat(location_lng) || 0
      },
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Save to Firestore
    const docRef = await db.collection('lost_items').add(itemData);
    const itemId = docRef.id;
    
    // Add to Python AI database
    // await addToPythonAI({
    //   description: description,
    //   imageUrl: itemData.image_url,
    //   name: name,
    //   location: itemData.location,
    //   date: itemData.date_lost
    // }, 'lost', itemId);
    
    // Find matches using Python AI
    const aiMatches = await callPythonAI({
      description: description,
      imageUrl: itemData.image_url
    }, 'lost');
    
    // Store matches in Firestore
    if (aiMatches.matches && aiMatches.matches.length > 0) {
      await storeMatches(itemId, 'lost', aiMatches.matches);
      
      const topMatch = aiMatches.matches[0];
      if (topMatch.similarity.overall_score > 75) {
        await createNotification(
          userId,
          `Potential match found for your lost ${name} with ${topMatch.similarity.overall_score}% similarity`,
          itemId,
          topMatch.item_id
        );
      }
    }
    
    res.json({
      message: 'Lost item reported successfully',
      item_id: itemId,
      item: itemData,
      structured_data: structuredData,
      matches: aiMatches.matches || [],
      total_matches: aiMatches.total_items || 0
    });
    
  } catch (error) {
    console.error('Report lost item error:', error);
    res.status(500).json({ error: error.message || 'Failed to report lost item' });
  }
});

// Get All Lost Items
app.get('/api/lost-items', verifyToken, async (req, res) => {
  try {
    const { user_id, category, limit = 50 } = req.query;
    
    let query = db.collection('lost_items').orderBy('created_at', 'desc');
    
    if (user_id) {
      query = query.where('user_id', '==', user_id);
    }
    
    if (category) {
      query = query.where('category', '==', category);
    }
    
    query = query.limit(parseInt(limit));
    
    const snapshot = await query.get();
    const items = [];
    
    snapshot.forEach(doc => {
      items.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.json({
      total: items.length,
      items: items
    });
    
  } catch (error) {
    console.error('Get lost items error:', error);
    res.status(500).json({ error: 'Failed to fetch lost items' });
  }
});

// Get Single Lost Item by ID
app.get('/api/lost-items/:id', verifyToken, async (req, res) => {
  try {
    const itemId = req.params.id;
    const itemDoc = await db.collection('lost_items').doc(itemId).get();
    
    if (!itemDoc.exists) {
      return res.status(404).json({ error: 'Lost item not found' });
    }
    
    res.json({
      id: itemDoc.id,
      ...itemDoc.data()
    });
    
  } catch (error) {
    console.error('Get lost item error:', error);
    res.status(500).json({ error: 'Failed to fetch lost item' });
  }
});

// Delete Lost Item
app.delete('/api/lost-items/:id', verifyToken, async (req, res) => {
  try {
    const itemId = req.params.id;
    const userId = req.user.uid;
    
    const itemDoc = await db.collection('lost_items').doc(itemId).get();
    
    if (!itemDoc.exists) {
      return res.status(404).json({ error: 'Lost item not found' });
    }
    
    const itemData = itemDoc.data();
    
    if (itemData.user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized to delete this item' });
    }
    
    if (itemData.image_public_id) {
      await deleteFromCloudinary(itemData.image_public_id);
    }
    
    await db.collection('lost_items').doc(itemId).delete();
    
    res.json({
      message: 'Lost item deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete lost item error:', error);
    res.status(500).json({ error: 'Failed to delete lost item' });
  }
});

// ============================================
// ROUTES - Found Items
// ============================================

// Report Found Item
app.post('/api/found-items', verifyToken, upload.single('image'), async (req, res) => {
  try {
    const { name, description, date_found, location_lat, location_lng } = req.body;
    const userId = req.user.uid;
    
    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }
    
    // Upload image to Cloudinary if provided (directly from buffer)
    let cloudinaryData = null;
    if (req.file) {
      cloudinaryData = await uploadToCloudinary(
        req.file.buffer,
        'found_items',
        `found_${userId}_${Date.now()}`
      );
    }
    
    // Generate structured keywords
    const structuredData = await generateStructuredKeywords(description);
    
    const itemData = {
      user_id: userId,
      name: name,
      description: description,
      image_url: cloudinaryData ? cloudinaryData.url : null,
      image_public_id: cloudinaryData ? cloudinaryData.public_id : null,
      image_metadata: cloudinaryData ? {
        width: cloudinaryData.width,
        height: cloudinaryData.height,
        format: cloudinaryData.format
      } : null,
      structured_keywords: structuredData.keywords || [],
      color: structuredData.color,
      category: structuredData.category,
      brand: structuredData.brand,
      distinctive_features: structuredData.distinctive_features || [],
      date_found: date_found || new Date().toISOString(),
      location: {
        lat: parseFloat(location_lat) || 0,
        lng: parseFloat(location_lng) || 0
      },
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const docRef = await db.collection('found_items').add(itemData);
    const itemId = docRef.id;
    
    // await addToPythonAI({
    //   description: description,
    //   imageUrl: itemData.image_url,
    //   name: name,
    //   location: itemData.location,
    //   date: itemData.date_found
    // }, 'found', itemId);
    
    const aiMatches = await callPythonAI({
      description: description,
      imageUrl: itemData.image_url
    }, 'found');
    
    if (aiMatches.matches && aiMatches.matches.length > 0) {
      await storeMatches(itemId, 'found', aiMatches.matches);
      
      for (const match of aiMatches.matches) {
        if (match.similarity.overall_score > 75) {
          const lostItemDoc = await db.collection('lost_items').doc(match.item_id).get();
          if (lostItemDoc.exists) {
            const lostItemOwnerId = lostItemDoc.data().user_id;
            await createNotification(
              lostItemOwnerId,
              `A found item matching your lost ${lostItemDoc.data().name} was reported with ${match.similarity.overall_score}% similarity`,
              match.item_id,
              itemId
            );
          }
        }
      }
    }
    
    res.json({
      message: 'Found item reported successfully',
      item_id: itemId,
      item: itemData,
      structured_data: structuredData,
      matches: aiMatches.matches || [],
      total_matches: aiMatches.total_items || 0
    });
    
  } catch (error) {
    console.error('Report found item error:', error);
    res.status(500).json({ error: error.message || 'Failed to report found item' });
  }
});

// Get All Found Items
app.get('/api/found-items', verifyToken, async (req, res) => {
  try {
    const { user_id, category, limit = 50 } = req.query;
    
    let query = db.collection('found_items').orderBy('created_at', 'desc');
    
    if (user_id) {
      query = query.where('user_id', '==', user_id);
    }
    
    if (category) {
      query = query.where('category', '==', category);
    }
    
    query = query.limit(parseInt(limit));
    
    const snapshot = await query.get();
    const items = [];
    
    snapshot.forEach(doc => {
      items.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.json({
      total: items.length,
      items: items
    });
    
  } catch (error) {
    console.error('Get found items error:', error);
    res.status(500).json({ error: 'Failed to fetch found items' });
  }
});

// Get Single Found Item by ID
app.get('/api/found-items/:id', verifyToken, async (req, res) => {
  try {
    const itemId = req.params.id;
    const itemDoc = await db.collection('found_items').doc(itemId).get();
    
    if (!itemDoc.exists) {
      return res.status(404).json({ error: 'Found item not found' });
    }
    
    res.json({
      id: itemDoc.id,
      ...itemDoc.data()
    });
    
  } catch (error) {
    console.error('Get found item error:', error);
    res.status(500).json({ error: 'Failed to fetch found item' });
  }
});

// Delete Found Item
app.delete('/api/found-items/:id', verifyToken, async (req, res) => {
  try {
    const itemId = req.params.id;
    const userId = req.user.uid;
    
    const itemDoc = await db.collection('found_items').doc(itemId).get();
    
    if (!itemDoc.exists) {
      return res.status(404).json({ error: 'Found item not found' });
    }
    
    const itemData = itemDoc.data();
    
    if (itemData.user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized to delete this item' });
    }
    
    if (itemData.image_public_id) {
      await deleteFromCloudinary(itemData.image_public_id);
    }
    
    await db.collection('found_items').doc(itemId).delete();
    
    res.json({
      message: 'Found item deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete found item error:', error);
    res.status(500).json({ error: 'Failed to delete found item' });
  }
});

// ============================================
// ROUTES - Matches
// ============================================

// Get Matches for a Specific Item
app.get('/api/matches/:itemType/:itemId', verifyToken, async (req, res) => {
  try {
    const { itemType, itemId } = req.params;
    const { min_score = 0 } = req.query;
    
    let query;
    if (itemType === 'lost') {
      query = db.collection('matches').where('lost_item_id', '==', itemId);
    } else {
      query = db.collection('matches').where('found_item_id', '==', itemId);
    }
    
    const snapshot = await query.get();
    const matches = [];
    
    for (const doc of snapshot.docs) {
      const matchData = doc.data();
      
      if (matchData.similarity_score >= parseFloat(min_score)) {
        const matchedItemId = itemType === 'lost' ? matchData.found_item_id : matchData.lost_item_id;
        const collection = itemType === 'lost' ? 'found_items' : 'lost_items';
        const matchedItemDoc = await db.collection(collection).doc(matchedItemId).get();
        
        matches.push({
          match_id: doc.id,
          ...matchData,
          matched_item: matchedItemDoc.exists ? matchedItemDoc.data() : null
        });
      }
    }
    
    matches.sort((a, b) => b.similarity_score - a.similarity_score);
    
    res.json({
      total: matches.length,
      matches: matches
    });
    
  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// ============================================
// ROUTES - Notifications
// ============================================

// Get User Notifications
app.get('/api/notifications', verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { unread_only = false, limit = 50 } = req.query;
    
    let query = db.collection('notifications')
      .where('user_id', '==', userId)
      .orderBy('created_at', 'desc');
    
    if (unread_only === 'true') {
      query = query.where('read', '==', false);
    }
    
    query = query.limit(parseInt(limit));
    
    const snapshot = await query.get();
    const notifications = [];
    
    snapshot.forEach(doc => {
      notifications.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.json({
      total: notifications.length,
      notifications: notifications
    });
    
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark Notification as Read
app.patch('/api/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user.uid;
    
    const notifDoc = await db.collection('notifications').doc(notificationId).get();
    
    if (!notifDoc.exists) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    if (notifDoc.data().user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    await db.collection('notifications').doc(notificationId).update({
      read: true
    });
    
    res.json({
      message: 'Notification marked as read'
    });
    
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// ============================================
// Health Check & Test Routes
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Lost & Found Backend Server is running',
    timestamp: new Date().toISOString(),
    storage: 'cloudinary (memory buffer)',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test Python AI Connection
app.get('/test/python-ai', async (req, res) => {
  try {
    const response = await axios.get(`${PYTHON_AI_SERVER}/health`);
    res.json({
      status: 'connected',
      python_server: response.data
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Cannot connect to Python AI server',
      error: error.message
    });
  }
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
  console.log(`
  ========================================
  Lost & Found Backend Server
  ========================================
  Server running on: http://localhost:${PORT}
  Python AI Server: ${PYTHON_AI_SERVER}
  
  API Endpoints:
  - POST   /api/users/register
  - GET    /api/users/profile
  - POST   /api/lost-items
  - GET    /api/lost-items
  - GET    /api/lost-items/:id
  - POST   /api/found-items
  - GET    /api/found-items
  - GET    /api/found-items/:id
  - GET    /api/matches/:itemType/:itemId
  - GET    /api/notifications
  - PATCH  /api/notifications/:id/read
  
  Health Check:
  - GET    /health
  - GET    /test/python-ai
  ========================================
  `);
});