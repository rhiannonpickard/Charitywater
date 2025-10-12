#!/bin/bash

# Ripple Effect - Deployment Helper
# This script helps prepare the game for deployment

echo "🌊 Ripple Effect - Deployment Helper"
echo "===================================="

# Check if we're in the right directory
if [ ! -f "index.html" ]; then
    echo "❌ Error: index.html not found. Make sure you're in the project root."
    exit 1
fi

# Create a build directory
echo "📁 Creating build directory..."
mkdir -p build

# Copy files to build directory
echo "📋 Copying files..."
cp index.html build/
cp preview.html build/
cp README.md build/

echo "✨ Build complete!"
echo ""
echo "🚀 Deployment options:"
echo "1. GitHub Pages: Push to gh-pages branch"
echo "2. Netlify: Drag build/ folder to netlify.com/drop"
echo "3. Vercel: Run 'vercel build/' in the build directory"
echo "4. Local server: 'cd build && python3 -m http.server 8000'"
echo ""

# GitHub Pages helper
read -p "📤 Deploy to GitHub Pages? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔧 Setting up GitHub Pages deployment..."
    
    # Check if git is initialized
    if [ ! -d ".git" ]; then
        echo "Initializing git repository..."
        git init
        git add .
        git commit -m "Initial commit: Ripple Effect game"
    fi
    
    # Create gh-pages branch
    git checkout -b gh-pages 2>/dev/null || git checkout gh-pages
    
    # Copy build files to root for GitHub Pages
    cp build/* .
    
    echo "📝 Files ready for GitHub Pages!"
    echo "   1. git add ."
    echo "   2. git commit -m 'Deploy to GitHub Pages'"
    echo "   3. git push origin gh-pages"
    echo "   4. Enable Pages in your GitHub repo settings"
    echo ""
    echo "🌐 Your game will be available at:"
    echo "   https://rhiannonpickard.github.io/Charitywater/"
fi

echo "✅ Done! Your Ripple Effect game is ready to share!"