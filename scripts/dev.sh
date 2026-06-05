#!/bin/bash

# PhotoSift Development Startup Script

echo "🚀 Starting PhotoSift Development Environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm."
    exit 1
fi

# Install backend dependencies
echo "📦 Installing backend dependencies..."
npm install

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd src/frontend
npm install
cd ../..

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p data target input duplicates

# Copy .env.example to .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✅ .env file created. Please update it with your configuration."
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start development:"
echo "  1. Backend: npm run dev"
echo "  2. Frontend: cd src/frontend && npm start"
echo ""
echo "Or use Docker:"
echo "  docker-compose up -d"
echo ""

# Made with Bob
