set -e

echo "🔨 Building POS PWA Retail for production..."

# Clean previous build
rm -rf dist

# Type checking
echo "🔍 Running type checking..."
npm run type-check

# Linting
echo "🧹 Running linter..."
npm run lint

# Unit tests
echo "🧪 Running unit tests..."
npm run test -- --coverage

# Build application
echo "🏗️ Building application..."
npm run build

# PWA generation
echo "📱 Generating PWA files..."
npm run pwa:generate

# Analyze bundle
echo "📊 Analyzing bundle size..."
npm run analyze

echo "✅ Build complete! Files are in the 'dist' directory."
