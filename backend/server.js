// ============================================
// server.js - Production-Ready for Render with Full Features
// ============================================

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const http = require('http');
const { Server } = require('socket.io');

require("dotenv").config();

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server for Socket.IO
const server = http.createServer(app);

// ============================================
// CORS Configuration for Production
// ============================================

const allowedOrigins = [
  "https://lost-and-found-system-bf6ae.web.app",
  "https://lost-and-found-system-bf6ae.firebaseapp.com",
  "http://localhost:5173",
  "http://localhost:3000"
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.options("*", cors());

// Body parsers
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
// Firebase Admin Setup (Render-safe)
// ============================================

let serviceAccount;

try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  console.log("✅ Firebase service account loaded successfully");
} catch (err) {
  console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:", err);
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

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
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
// Socket.IO Configuration
// ============================================

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token provided"));
    
    const decodedToken = await admin.auth().verifyIdToken(token);
    socket.user = decodedToken;
    next();
  } catch (err) {
    console.error("Socket auth error:", err);
    next(new Error("Unauthorized"));
  }
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  const uid = socket.user.uid;
  console.log("✅ Socket connected:", uid);

  // Join user's personal room for notifications
  socket.join(uid);

  // Join a specific chat room
  socket.on("join_chat", async (chatId) => {
    try {
      const chatDoc = await db.collection("chats").doc(chatId).get();
      if (!chatDoc.exists) return;
      
      const chat = chatDoc.data();
      if (!chat.participants.includes(uid)) return;

      socket.join(chatId);
      console.log(`User ${uid} joined chat ${chatId}`);
    } catch (err) {
      console.error("Join chat error:", err);
    }
  });

  // Send message in chat
  socket.on("send_message", async ({ chatId, text }) => {
    try {
      if (!chatId || !text || text.trim().length === 0) return;

      const chatRef = db.collection("chats").doc(chatId);
      const chatDoc = await chatRef.get();
      
      if (!chatDoc.exists) return;

      const chat = chatDoc.data();
      if (!chat.participants.includes(uid)) return;

      const msgRef = await chatRef.collection("messages").add({
        sender_id: uid,
        text: text.trim(),
        sent_at: admin.firestore.FieldValue.serverTimestamp(),
        read: false
      });

      await chatRef.update({
        last_message: text.trim(),
        last_message_time: admin.firestore.FieldValue.serverTimestamp()
      });

      // Emit to all users in the chat room
      io.to(chatId).emit("receive_message", {
        message_id: msgRef.id,
        chatId,
        sender_id: uid,
        text: text.trim(),
        sent_at: new Date().toISOString()
      });

      // Notification for other user
      const receiverId = chat.participants.find(id => id !== uid);
      await createNotification(
        receiverId,
        "New message received",
        null,
        chatId,
        "chat_message"
      );

    } catch (err) {
      console.error("Send message error:", err);
    }
  });

  // Mark messages as read
  socket.on("mark_read", async ({ chatId }) => {
    try {
      const messagesSnapshot = await db.collection("chats")
        .doc(chatId)
        .collection("messages")
        .where("sender_id", "!=", uid)
        .where("read", "==", false)
        .get();

      const batch = db.batch();
      messagesSnapshot.forEach(doc => {
        batch.update(doc.ref, { read: true });
      });
      await batch.commit();

      io.to(chatId).emit("messages_read", { chatId, userId: uid });
    } catch (err) {
      console.error("Mark read error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", uid);
  });
});

// ============================================
// Helper Functions
// ============================================

async function uploadToCloudinary(fileBuffer, folder = 'uploads', publicId = null) {
  return new Promise((resolve, reject) => {
    const options = {
      folder,
      resource_type: 'auto',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    };
    if (publicId) options.public_id = publicId;

    const uploadStream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) {
        console.error('Cloudinary upload error:', err);
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
    });

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
}

async function deleteFromCloudinary(publicId) {
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("Cloudinary delete error:", err);
    throw new Error('Failed to delete image from Cloudinary');
  }
}

async function downloadImageBuffer(imageUrl) {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (error) {
    console.error('Image download error:', error);
    throw new Error('Failed to download image for AI processing');
  }
}

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

async function callPythonAI(itemData, itemType) {
  try {
    const formData = new FormData();
    formData.append('type', itemType);
    formData.append('text', itemData.description);

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
      maxContentLength: Infinity,
      timeout: 30000
    });
    return response.data;
  } catch (error) {
    console.error("Python AI server error:", error.message);
    return { matches: [], total_items: 0 };
  }
}

async function storeMatches(itemId, itemType, matches, itemUserId) {
  try {
    const batch = db.batch();
    const storedMatches = [];
    
    for (const match of matches) {
      const matchedCollection = itemType === 'lost' ? 'found_items' : 'lost_items';
      const matchedItemDoc = await db.collection(matchedCollection).doc(match.item_id).get();
      
      if (!matchedItemDoc.exists) {
        console.log(`Matched item ${match.item_id} not found, skipping...`);
        continue;
      }
      
      const matchedItemUserId = matchedItemDoc.data().user_id;
      
      const matchRef = db.collection('matches').doc();
      const matchId = matchRef.id;
      
      const matchData = {
        match_id: matchId,
        lost_item_id: itemType === 'lost' ? itemId : match.item_id,
        found_item_id: itemType === 'found' ? itemId : match.item_id,
        lost_user_id: itemType === 'lost' ? itemUserId : matchedItemUserId,
        found_user_id: itemType === 'found' ? itemUserId : matchedItemUserId,
        similarity_score: match.similarity.overall_score,
        text_score: match.similarity.text_similarity,
        image_score: match.similarity.image_similarity,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      };
      
      batch.set(matchRef, matchData);
      storedMatches.push(matchData);
    }
    
    await batch.commit();
    return storedMatches;
  } catch (error) {
    console.error('Error storing matches:', error);
    return [];
  }
}

async function createNotification(userId, message, itemId, matchId, type = 'match') {
  try {
    const notifRef = await db.collection('notifications').add({
      user_id: userId,
      type,
      message,
      item_id: itemId,
      match_id: matchId,
      chat_id: matchId,
      read: false,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    // Real-time notification via Socket.IO
    io.to(userId).emit("new_notification", {
      notification_id: notifRef.id,
      message,
      type,
      read: false,
      created_at: new Date()
    });

  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

async function createChatForMatch(matchId, lostUserId, foundUserId) {
  try {
    if (lostUserId === foundUserId) {
      console.log('Same user for both items, chat not created');
      return null;
    }

    const chatRef = db.collection('chats').doc(matchId);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      await chatRef.set({
        match_id: matchId,
        participants: [lostUserId, foundUserId],
        last_message: null,
        last_message_time: null,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`✅ Chat created for match: ${matchId}`);
      return matchId;
    }
    
    return matchId;
  } catch (error) {
    console.error('Error creating chat:', error);
    return null;
  }
}

// ============================================
// Middleware: Verify Firebase Token
// ============================================

const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (err) {
    console.error("Token verify error:", err);
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// ============================================
// ROUTES - Authentication & User Management
// ============================================

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

app.get('/api/users/profile', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    res.json({ user: userDoc.data() });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// ============================================
// ROUTES - Lost Items
// ============================================

app.post('/api/lost-items', verifyToken, upload.single('image'), async (req, res) => {
  try {
    const { name, description, date_lost, location_lat, location_lng } = req.body;
    const userId = req.user.uid;
    
    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }
    
    let cloudinaryData = null;
    if (req.file) {
      cloudinaryData = await uploadToCloudinary(
        req.file.buffer,
        'lost_items',
        `lost_${userId}_${Date.now()}`
      );
    }
    
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
      date_lost: date_lost || new Date().toISOString(),
      location: {
        lat: parseFloat(location_lat) || 0,
        lng: parseFloat(location_lng) || 0
      },
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const docRef = await db.collection('lost_items').add(itemData);
    const itemId = docRef.id;
    
    const aiMatches = await callPythonAI({
      description: description,
      imageUrl: itemData.image_url
    }, 'lost');
    
    if (aiMatches.matches && aiMatches.matches.length > 0) {
      const storedMatches = await storeMatches(itemId, 'lost', aiMatches.matches, userId);
      
      for (const storedMatch of storedMatches) {
        if (storedMatch.similarity_score > 75) {
          if (storedMatch.lost_user_id !== storedMatch.found_user_id) {
            await createChatForMatch(
              storedMatch.match_id,
              storedMatch.lost_user_id,
              storedMatch.found_user_id
            );
          }
          
          await createNotification(
            userId,
            `Potential match found for your lost ${name} with ${storedMatch.similarity_score}% similarity`,
            itemId,
            storedMatch.match_id,
            'match'
          );
          
          if (storedMatch.found_user_id !== userId) {
            const foundItemDoc = await db.collection('found_items').doc(storedMatch.found_item_id).get();
            if (foundItemDoc.exists) {
              await createNotification(
                storedMatch.found_user_id,
                `Your found item matches a lost ${name} with ${storedMatch.similarity_score}% similarity`,
                storedMatch.found_item_id,
                storedMatch.match_id,
                'match'
              );
            }
          }
        }
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

app.get('/api/lost-items', verifyToken, async (req, res) => {
  try {
    const { user_id, category, limit = 50 } = req.query;
    
    let query = db.collection('lost_items').orderBy('created_at', 'desc');
    
    if (user_id) query = query.where('user_id', '==', user_id);
    if (category) query = query.where('category', '==', category);
    
    query = query.limit(parseInt(limit));
    
    const snapshot = await query.get();
    const items = [];
    
    snapshot.forEach(doc => {
      items.push({ id: doc.id, ...doc.data() });
    });
    
    res.json({ total: items.length, items: items });
  } catch (error) {
    console.error('Get lost items error:', error);
    res.status(500).json({ error: 'Failed to fetch lost items' });
  }
});

app.get('/api/lost-items/:id', verifyToken, async (req, res) => {
  try {
    const itemDoc = await db.collection('lost_items').doc(req.params.id).get();
    
    if (!itemDoc.exists) {
      return res.status(404).json({ error: 'Lost item not found' });
    }
    
    res.json({ id: itemDoc.id, ...itemDoc.data() });
  } catch (error) {
    console.error('Get lost item error:', error);
    res.status(500).json({ error: 'Failed to fetch lost item' });
  }
});

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
    
    res.json({ message: 'Lost item deleted successfully' });
  } catch (error) {
    console.error('Delete lost item error:', error);
    res.status(500).json({ error: 'Failed to delete lost item' });
  }
});

// ============================================
// ROUTES - Found Items
// ============================================

app.post('/api/found-items', verifyToken, upload.single('image'), async (req, res) => {
  try {
    const { name, description, date_found, location_lat, location_lng } = req.body;
    const userId = req.user.uid;
    
    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }
    
    let cloudinaryData = null;
    if (req.file) {
      cloudinaryData = await uploadToCloudinary(
        req.file.buffer,
        'found_items',
        `found_${userId}_${Date.now()}`
      );
    }
    
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
    
    const aiMatches = await callPythonAI({
      description: description,
      imageUrl: itemData.image_url
    }, 'found');
    
    if (aiMatches.matches && aiMatches.matches.length > 0) {
      const storedMatches = await storeMatches(itemId, 'found', aiMatches.matches, userId);
      
      for (const storedMatch of storedMatches) {
        if (storedMatch.similarity_score > 75) {
          if (storedMatch.lost_user_id !== storedMatch.found_user_id) {
            await createChatForMatch(
              storedMatch.match_id,
              storedMatch.lost_user_id,
              storedMatch.found_user_id
            );
          }
          
          await createNotification(
            userId,
            `Your found item matches a lost ${name} with ${storedMatch.similarity_score}% similarity`,
            itemId,
            storedMatch.match_id,
            'match'
          );
          
          if (storedMatch.lost_user_id !== userId) {
            const lostItemDoc = await db.collection('lost_items').doc(storedMatch.lost_item_id).get();
            if (lostItemDoc.exists) {
              await createNotification(
                storedMatch.lost_user_id,
                `A found item matching your lost ${lostItemDoc.data().name} was reported with ${storedMatch.similarity_score}% similarity`,
                storedMatch.lost_item_id,
                storedMatch.match_id,
                'match'
              );
            }
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

app.get('/api/found-items', verifyToken, async (req, res) => {
  try {
    const { user_id, category, limit = 50 } = req.query;
    
    let query = db.collection('found_items').orderBy('created_at', 'desc');
    
    if (user_id) query = query.where('user_id', '==', user_id);
    if (category) query = query.where('category', '==', category);
    
    query = query.limit(parseInt(limit));
    
    const snapshot = await query.get();
    const items = [];
    
    snapshot.forEach(doc => {
      items.push({ id: doc.id, ...doc.data() });
    });
    
    res.json({ total: items.length, items: items });
  } catch (error) {
    console.error('Get found items error:', error);
    res.status(500).json({ error: 'Failed to fetch found items' });
  }
});

app.get('/api/found-items/:id', verifyToken, async (req, res) => {
  try {
    const itemDoc = await db.collection('found_items').doc(req.params.id).get();
    
    if (!itemDoc.exists) {
      return res.status(404).json({ error: 'Found item not found' });
    }
    
    res.json({ id: itemDoc.id, ...itemDoc.data() });
  } catch (error) {
    console.error('Get found item error:', error);
    res.status(500).json({ error: 'Failed to fetch found item' });
  }
});

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
    
    res.json({ message: 'Found item deleted successfully' });
  } catch (error) {
    console.error('Delete found item error:', error);
    res.status(500).json({ error: 'Failed to delete found item' });
  }
});

// ============================================
// ROUTES - Matches
// ============================================

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
    
    res.json({ total: matches.length, matches: matches });
  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// ============================================
// ROUTES - Chat System
// ============================================

app.post('/api/chats/create', verifyToken, async (req, res) => {
  try {
    const { match_id } = req.body;
    
    if (!match_id) {
      return res.status(400).json({ error: 'match_id is required' });
    }

    const matchDoc = await db.collection('matches').doc(match_id).get();
    
    if (!matchDoc.exists) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const match = matchDoc.data();

    if (match.lost_user_id === match.found_user_id) {
      return res.status(400).json({ error: 'Chat not allowed: same user for both items' });
    }

    const chatRef = db.collection('chats').doc(match_id);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      await chatRef.set({
        match_id: match_id,
        participants: [match.lost_user_id, match.found_user_id],
        last_message: null,
        last_message_time: null,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
      
      res.json({ 
        message: 'Chat created successfully', 
        chat_id: match_id 
      });
    } else {
      res.json({ 
        message: 'Chat already exists', 
        chat_id: match_id 
      });
    }

  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chats', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;

    const snapshot = await db.collection('chats')
      .where('participants', 'array-contains', uid)
      .orderBy('created_at', 'desc')
      .get();

    const chats = [];
    
    for (const doc of snapshot.docs) {
      const chatData = doc.data();
      
      const matchDoc = await db.collection('matches').doc(chatData.match_id).get();
      const matchData = matchDoc.exists ? matchDoc.data() : null;
      
      const otherUserId = chatData.participants.find(id => id !== uid);
      const otherUserDoc = await db.collection('users').doc(otherUserId).get();
      const otherUser = otherUserDoc.exists ? otherUserDoc.data() : null;
      
      chats.push({
        chat_id: doc.id,
        ...chatData,
        match: matchData,
        other_user: otherUser
      });
    }

    res.json({
      total: chats.length,
      chats: chats
    });
    
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chats/:chatId', verifyToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const uid = req.user.uid;

    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const chat = chatDoc.data();
    
    if (!chat.participants.includes(uid)) {
      return res.status(403).json({ error: 'Not authorized to access this chat' });
    }

    const matchDoc = await db.collection('matches').doc(chat.match_id).get();
    const matchData = matchDoc.exists ? matchDoc.data() : null;

    res.json({
      chat_id: chatDoc.id,
      ...chat,
      match: matchData
    });
    
  } catch (error) {
    console.error('Get chat details error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chats/:chatId/messages', verifyToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { text } = req.body;
    const uid = req.user.uid;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const chat = chatDoc.data();
    
    if (!chat.participants.includes(uid)) {
      return res.status(403).json({ error: 'Not authorized to send messages in this chat' });
    }

    const messageRef = await chatRef.collection('messages').add({
      sender_id: uid,
      text: text.trim(),
      sent_at: admin.firestore.FieldValue.serverTimestamp(),
      read: false
    });

    await chatRef.update({
      last_message: text.trim(),
      last_message_time: admin.firestore.FieldValue.serverTimestamp()
    });

    const receiverId = chat.participants.find(id => id !== uid);
    await createNotification(
      receiverId,
      'New message received',
      null,
      chatId,
      'chat_message'
    );

    res.json({ 
      message: 'Message sent successfully',
      message_id: messageRef.id
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chats/:chatId/messages', verifyToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const uid = req.user.uid;
    const { limit = 100 } = req.query;

    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (!chatDoc.data().participants.includes(uid)) {
      return res.status(403).json({ error: 'Unauthorized to view messages' });
    }

    const snapshot = await chatRef.collection('messages')
      .orderBy('sent_at', 'asc')
      .limit(parseInt(limit))
      .get();

    const messages = [];
    
    snapshot.forEach(doc => {
      messages.push({
        message_id: doc.id,
        ...doc.data()
      });
    });

    res.json({
      total: messages.length,
      messages: messages
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/chats/:chatId/messages/read', verifyToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const uid = req.user.uid;

    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (!chatDoc.data().participants.includes(uid)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const messagesSnapshot = await chatRef.collection('messages')
      .where('sender_id', '!=', uid)
      .where('read', '==', false)
      .get();

    const batch = db.batch();
    messagesSnapshot.forEach(doc => {
      batch.update(doc.ref, { read: true });
    });
    await batch.commit();

    res.json({ 
      message: 'Messages marked as read',
      count: messagesSnapshot.size
    });

  } catch (error) {
    console.error('Mark messages read error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ROUTES - Notifications
// ============================================

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

app.patch('/api/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user.uid;

    const notifRef = db.collection('notifications').doc(notificationId);
    const notifDoc = await notifRef.get();

    if (!notifDoc.exists) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (notifDoc.data().user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await notifRef.update({ read: true });

    io.to(userId).emit("notification_read");

    res.json({ message: 'Notification marked as read' });

  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

app.patch('/api/notifications/read-all', verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid;

    const snapshot = await db.collection('notifications')
      .where('user_id', '==', userId)
      .where('read', '==', false)
      .get();

    const batch = db.batch();
    snapshot.forEach(doc => batch.update(doc.ref, { read: true }));
    await batch.commit();

    io.to(userId).emit("notification_read");

    res.json({
      message: 'All notifications marked as read',
      count: snapshot.size
    });

  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

app.delete('/api/notifications/delete-all', verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid;

    const snapshot = await db.collection('notifications')
      .where('user_id', '==', userId)
      .get();

    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    io.to(userId).emit("notification_read");

    res.json({
      message: 'All notifications deleted',
      count: snapshot.size
    });

  } catch (error) {
    console.error('Delete all notifications error:', error);
    res.status(500).json({ error: 'Failed to delete notifications' });
  }
});

app.delete('/api/notifications/:id', verifyToken, async (req, res) => {
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
    
    await db.collection('notifications').doc(notificationId).delete();
    
    res.json({
      message: 'Notification deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
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
    environment: process.env.NODE_ENV || 'production',
    frontend: 'https://lost-and-found-system-bf6ae.web.app'
  });
});

app.get('/test/python-ai', async (req, res) => {
  try {
    const response = await axios.get(`${PYTHON_AI_SERVER}/health`, { timeout: 5000 });
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
// Start Server with Socket.IO
// ============================================

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
========================================
🚀 Lost & Found Backend Server
========================================
✅ Server running on port: ${PORT}
✅ Frontend: https://lost-and-found-system-bf6ae.web.app
✅ Python AI Server: ${PYTHON_AI_SERVER}
✅ Socket.IO: Enabled
✅ Storage: Cloudinary (Memory Buffer)
✅ Environment: ${process.env.NODE_ENV || 'production'}
========================================

📡 API Endpoints:

👤 USER MANAGEMENT
  POST   /api/users/register
  GET    /api/users/profile

📦 LOST ITEMS
  POST   /api/lost-items
  GET    /api/lost-items
  GET    /api/lost-items/:id
  DELETE /api/lost-items/:id

🔍 FOUND ITEMS
  POST   /api/found-items
  GET    /api/found-items
  GET    /api/found-items/:id
  DELETE /api/found-items/:id

🎯 MATCHES
  GET    /api/matches/:itemType/:itemId

💬 CHAT SYSTEM
  POST   /api/chats/create
  GET    /api/chats
  GET    /api/chats/:chatId
  POST   /api/chats/:chatId/messages
  GET    /api/chats/:chatId/messages
  PATCH  /api/chats/:chatId/messages/read

🔔 NOTIFICATIONS
  GET    /api/notifications
  PATCH  /api/notifications/:id/read
  PATCH  /api/notifications/read-all
  DELETE /api/notifications/delete-all
  DELETE /api/notifications/:id

🏥 HEALTH CHECK
  GET    /health
  GET    /test/python-ai

========================================
  `);
});