#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Ripple Effect - Deployment Helper
# This script helps prepare the game for deployment

echo "🌊 Ripple Effect - Deployment Helper"
echo "===================================="

# Check if we're in the right directory
if [[ ! -f "index.html" ]]; then
    echo "❌ Error: index.html not found. Make sure you're in the project root."
    exit 1
fi

# Create a build directory
echo "📁 Creating build directory..."
mkdir -p build

# Copy files to build directory
echo "📋 Copying files..."
cp -v index.html styles.css game.js preview.html README.md build/

echo "✨ Build complete!"
echo ""
echo "🚀 Deployment options:"
echo "1. GitHub Pages: Push to gh-pages branch"
echo "2. Netlify: Drag build/ folder to netlify.com/drop"
echo "3. Vercel: Run 'vercel build/' in the build directory"
echo "4. Local server: 'cd build && python3 -m http.server 8000'"
echo ""

# GitHub Pages helper
read -rp "📤 Deploy to GitHub Pages? (y/n): " -n 1 -r
echo
if [[ ${REPLY:-n} =~ ^[Yy]$ ]]; then
    echo "🔧 Setting up GitHub Pages deployment..."
    
    # Check if git is initialized
        if [[ ! -d ".git" ]]; then
        echo "Initializing git repository..."
        git init
        git add .
        git commit -m "Initial commit: Ripple Effect game"
    fi
    
        # Build subtree deployment to gh-pages branch
        echo "🚚 Pushing build/ as subtree to gh-pages branch..."
        if git rev-parse --verify gh-pages >/dev/null 2>&1; then
            : # branch exists
        else
            git checkout -b gh-pages
            git reset --hard
            git checkout -
        fi
    
        git add build
        git commit -m "chore(build): update static site" || true
    
        # Use subtree split to create a commit from build directory and push it
        SHA=$(git subtree split --prefix build gh-pages 2>/dev/null || git subtree split --prefix build HEAD)
        git push -f origin "$SHA":gh-pages
    
        echo "📝 GitHub Pages updated!"
        echo "   • Branch: gh-pages"
        echo "   • Source: /build subtree"
        echo "   • Next: Ensure Pages is enabled to serve from gh-pages"
    echo ""
    echo "🌐 Your game will be available at:"
    echo "   https://rhiannonpickard.github.io/Charitywater/"
fi

echo "✅ Done! Your Ripple Effect game is ready to share!"