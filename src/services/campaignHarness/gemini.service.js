/**
 * Gemini Image Generation Service
 *
 * Uses Google's Gemini API (Nano Banana) to generate campaign background images.
 * The generated background is then composited with text overlays by the compositor.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class GeminiImageService {
  constructor() {
    this.apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    this.client = null;

    // Gemini image generation models (Nano Banana family)
    this.IMAGE_MODELS = [
      'gemini-2.0-flash-exp',     // Latest with image gen
      'imagen-3.0-generate-001',   // Imagen 3 via Gemini API
    ];

    if (this.apiKey) {
      this.client = new GoogleGenerativeAI(this.apiKey);
      logger.info('Gemini Image Service initialized');
    } else {
      logger.warn('Gemini API key not configured - image generation disabled');
    }
  }

  isConfigured() {
    return !!this.client;
  }

  /**
   * Generate a background image for a campaign based on job category
   * @param {Object} params
   * @param {string} params.category - Job category (warehouse, construction, driver, etc.)
   * @param {string} params.title - Job title for context
   * @param {string} params.location - Job location for context
   * @returns {Promise<Buffer>} Generated image as buffer
   */
  async generateBackground(params) {
    const { category, title, location } = params;

    if (!this.isConfigured()) {
      throw new Error('Gemini API not configured');
    }

    const prompt = this._buildPrompt(category, title, location);
    logger.info('Generating campaign background', { category, title });

    let lastError = null;

    for (const modelName of this.IMAGE_MODELS) {
      try {
        logger.info(`Trying Gemini model: ${modelName}`);
        const imageBuffer = await this._generateWithModel(modelName, prompt);
        logger.info(`✓ Image generated successfully with ${modelName}`);
        return imageBuffer;
      } catch (error) {
        lastError = error;
        logger.warn(`✗ ${modelName} failed: ${error.message}`);

        // If model not found, try next
        if (error.message.includes('404') || error.message.includes('not found')) {
          continue;
        }
        // If rate limited, try next
        if (error.message.includes('429') || error.message.includes('quota')) {
          continue;
        }
      }
    }

    throw lastError || new Error('All Gemini image models exhausted');
  }

  /**
   * Generate image using specific model
   * @private
   */
  async _generateWithModel(modelName, prompt) {
    const model = this.client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.7,
      }
    });

    // For Imagen models, use different API
    if (modelName.startsWith('imagen')) {
      return await this._generateWithImagen(prompt);
    }

    // For Gemini models with image output capability
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseModalities: ['image', 'text'],
        responseMimeType: 'image/png',
      }
    });

    const response = result.response;

    // Extract image from response
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64Data = part.inlineData.data;
        return Buffer.from(base64Data, 'base64');
      }
    }

    throw new Error('No image in response');
  }

  /**
   * Generate using Imagen 3 API
   * @private
   */
  async _generateWithImagen(prompt) {
    // Imagen 3 uses a different endpoint
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '1:1',
            safetyFilterLevel: 'block_few',
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Imagen API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const base64Image = data.predictions[0].bytesBase64Encoded;
    return Buffer.from(base64Image, 'base64');
  }

  /**
   * Build prompt for image generation based on job category
   * @private
   */
  _buildPrompt(category, title, location) {
    const categoryPrompts = {
      warehouse: 'A modern warehouse interior with organized shelving and forklifts, warm industrial lighting, professional work environment',
      construction: 'A construction site with steel beams and equipment, golden hour lighting, professional workers in safety gear',
      driver: 'A delivery truck on an open highway at sunset, scenic route, professional transportation theme',
      retail: 'A bright modern retail store interior, clean shelves, welcoming atmosphere',
      healthcare: 'A clean modern healthcare facility, professional medical environment, calming colors',
      hospitality: 'A welcoming hotel or restaurant interior, warm lighting, professional service atmosphere',
      manufacturing: 'A modern manufacturing floor with machinery, clean industrial environment, precision equipment',
      logistics: 'A busy logistics center with packages and conveyor belts, efficient operations',
      general: 'A professional workplace environment, modern office or work setting, diverse team collaboration'
    };

    const categoryDesc = categoryPrompts[category?.toLowerCase()] || categoryPrompts.general;

    return `Create a photorealistic background image for a job recruitment campaign.

Scene: ${categoryDesc}

Requirements:
- Photorealistic style, high quality
- Vibrant but not oversaturated colors
- Good contrast for text overlay
- No text or logos in the image
- Professional, aspirational feeling
- Leave space at bottom third for text overlay (slightly darker/gradient friendly area)
- 1:1 square aspect ratio
- Resolution suitable for social media (1080x1080)

The image should inspire job seekers and look professional for a ${title} position${location ? ` in ${location}` : ''}.`;
  }

  /**
   * Save generated image to temp file
   * @param {Buffer} imageBuffer
   * @param {string} filename
   * @returns {Promise<string>} Path to saved file
   */
  async saveToTemp(imageBuffer, filename) {
    const tempDir = path.join(process.cwd(), 'data', 'campaign-images');
    await fs.mkdir(tempDir, { recursive: true });

    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, imageBuffer);

    logger.info('Image saved to temp', { path: filePath });
    return filePath;
  }
}

module.exports = new GeminiImageService();
