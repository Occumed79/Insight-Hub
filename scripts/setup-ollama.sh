#!/bin/bash

# Ollama Setup Script for Insight-Hub
# This script sets up Ollama with recommended models for AI extraction

set -e

echo "🚀 Setting up Ollama for Insight-Hub..."

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama is not installed. Installing..."
    
    # Detect OS and install accordingly
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl -fsSL https://ollama.com/install.sh | sh
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        if ! command -v brew &> /dev/null; then
            echo "❌ Homebrew is not installed. Please install Homebrew first."
            exit 1
        fi
        brew install ollama
    else
        echo "❌ Unsupported OS. Please install Ollama manually from https://ollama.com"
        exit 1
    fi
else
    echo "✅ Ollama is already installed"
fi

# Start Ollama service
echo "📦 Starting Ollama service..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    ollama serve > /dev/null 2>&1 &
    OLLAMA_PID=$!
    echo "✅ Ollama service started (PID: $OLLAMA_PID)"
else
    sudo systemctl start ollama || ollama serve > /dev/null 2>&1 &
    echo "✅ Ollama service started"
fi

# Wait for Ollama to be ready
echo "⏳ Waiting for Ollama to be ready..."
sleep 5

# Check if Ollama is responding
if ! curl -s http://localhost:11434/api/tags > /dev/null; then
    echo "❌ Ollama service is not responding. Please check the service status."
    exit 1
fi

echo "✅ Ollama service is ready"

# Pull recommended models
echo "📥 Pulling recommended models..."

# Llama 3.2 - Good balance of speed and quality
echo "  - Pulling llama3.2 (3B)..."
ollama pull llama3.2

# Mistral - Alternative model
echo "  - Pulling mistral (7B)..."
ollama pull mistral

# Qwen - Good for extraction tasks
echo "  - Pulling qwen2.5 (7B)..."
ollama pull qwen2.5

# Set default model
echo "⚙️  Setting default model to llama3.2..."
export OLLAMA_MODEL=llama3.2

# Add to shell profile for persistence
echo "📝 Adding Ollama configuration to shell profile..."

SHELL_PROFILE=""
if [[ "$SHELL" == "/bin/zsh" ]]; then
    SHELL_PROFILE="$HOME/.zshrc"
elif [[ "$SHELL" == "/bin/bash" ]]; then
    SHELL_PROFILE="$HOME/.bashrc"
fi

if [[ -n "$SHELL_PROFILE" ]]; then
    if ! grep -q "OLLAMA_MODEL" "$SHELL_PROFILE" 2>/dev/null; then
        echo "" >> "$SHELL_PROFILE"
        echo "# Insight-Hub Ollama Configuration" >> "$SHELL_PROFILE"
        echo "export OLLAMA_MODEL=llama3.2" >> "$SHELL_PROFILE"
        echo "export OLLAMA_NUM_THREAD=4" >> "$SHELL_PROFILE"
        echo "export OLLAMA_MAX_QUEUE=8" >> "$SHELL_PROFILE"
        echo "✅ Configuration added to $SHELL_PROFILE"
    else
        echo "✅ Configuration already exists in $SHELL_PROFILE"
    fi
fi

# Test the model
echo "🧪 Testing llama3.2 model..."
TEST_RESPONSE=$(ollama run llama3.2 "Say 'Hello from Insight-Hub!' in one word." 2>/dev/null)
echo "  Model response: $TEST_RESPONSE"

if [[ -n "$TEST_RESPONSE" ]]; then
    echo "✅ Model is working correctly"
else
    echo "⚠️  Model test failed, but installation completed"
fi

echo ""
echo "✨ Ollama setup complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Set environment variable: export LOCAL_LLM_ENDPOINT=http://localhost:11434"
echo "  2. Set environment variable: export LOCAL_LLM_MODEL=llama3.2"
echo "  3. Restart the Insight-Hub API server"
echo ""
echo "💡 Available models:"
ollama list

# Cleanup background process on macOS
if [[ "$OSTYPE" == "darwin"* ]] && [[ -n "$OLLAMA_PID" ]]; then
    kill $OLLAMA_PID 2>/dev/null || true
    echo "ℹ️  Stopped temporary Ollama process. Use 'ollama serve' to run it permanently."
fi
