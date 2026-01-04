#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PORT } = require('../src/config/constants');
const apiRoutes = require('../src/routes/api');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api', apiRoutes);

// Serve the dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Productivity Dashboard API running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
