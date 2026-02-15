# Lingo-Key - AI Input Translator

Tran is a Chrome Extension that allows you to translate text directly within any input field (input, textarea, contenteditable) on the web using OpenAI-compatible LLM APIs.

![Demo](public/icons/icon-128.png)

## Features

- **In-place Translation**: Replaces text directly in the input field.
- **Streaming Output**: See the translation as it's being generated.
- **Keyboard Shortcut**: `Alt+T` (Windows/Linux) or `Ctrl+Shift+T` (macOS).
- **Privacy Focused**: API keys are stored locally in your browser.
- **Customizable**: Supports any OpenAI-compatible API endpoint (e.g., OpenAI, Anthropic, Local LLMs via LM Studio/Ollama).

## Installation

1. Download the latest release (`lingo-key-release.zip`).
2. Unzip the file.
3. Open Chrome and navigate to `chrome://extensions/`.
4. Enable "Developer mode" in the top right.
5. Click "Load unpacked" and select the `dist` folder from the unzipped archive.

## Usage

1. Click the extension icon to open the Options page.
2. Configure your API endpoint and API Key.
3. Go to any webpage with an input field.
4. Type some text, select the input field, and press `Ctrl+Shift+T` (macOS) or `Alt+T` (Windows).
5. Watch the text translate in real-time!

## Development

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Run in development mode
npm run dev
```

## License

ISC
