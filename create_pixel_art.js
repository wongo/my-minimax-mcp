/**
 * Pixel Art Generator: Taiwan × Japan Friendship
 * Pure Node.js PNG generator (no external dependencies)
 */

// Color palette (16-bit retro style)
const PALETTE = {
    skin_light: [255, 220, 177],
    skin_tan: [255, 200, 150],
    hair_dark: [40, 30, 25],
    hair_brown: [60, 40, 30],
    white: [255, 255, 255],
    red: [220, 40, 60],
    pink: [255, 150, 180],
    light_pink: [255, 200, 210],
    taiwan_red: [200, 30, 50],
    taiwan_blue: [30, 80, 160],
    boba_brown: [101, 67, 33],
    green_dark: [40, 120, 60],
    green_light: [80, 160, 90],
    sakura_pink: [255, 183, 197],
    sakura_dark: [200, 100, 130],
    bg_cream: [255, 245, 230],
    bg_white: [255, 255, 255],
    heart_red: [230, 50, 80],
    black: [30, 30, 30],
    dark_outline: [20, 20, 20],
    straw_color: [255, 180, 100],
    bubble_black: [30, 30, 30],
};

// Image dimensions
const WIDTH = 160;
const HEIGHT = 120;
const PIXEL_SIZE = 2;

// Create pixel grid
const pixels = Array(HEIGHT).fill(null).map(() => Array(WIDTH).fill(PALETTE.bg_white));

function setPixel(x, y, color) {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
        pixels[y][x] = color;
    }
}

function drawRect(x, y, w, h, color) {
    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            setPixel(x + dx, y + dy, color);
        }
    }
}

// Simple 3x5 pixel font patterns
const FONT = {
    'A': [0b010, 0b101, 0b111, 0b101, 0b101],
    'B': [0b110, 0b101, 0b110, 0b101, 0b110],
    'C': [0b011, 0b100, 0b100, 0b100, 0b011],
    'D': [0b110, 0b101, 0b101, 0b101, 0b110],
    'E': [0b111, 0b100, 0b110, 0b100, 0b111],
    'F': [0b111, 0b100, 0b110, 0b100, 0b100],
    'G': [0b011, 0b100, 0b101, 0b101, 0b011],
    'H': [0b101, 0b101, 0b111, 0b101, 0b101],
    'I': [0b111, 0b010, 0b010, 0b010, 0b111],
    'J': [0b001, 0b001, 0b001, 0b101, 0b010],
    'K': [0b101, 0b110, 0b100, 0b110, 0b101],
    'L': [0b100, 0b100, 0b100, 0b100, 0b111],
    'M': [0b101, 0b111, 0b101, 0b101, 0b101],
    'N': [0b101, 0b111, 0b111, 0b101, 0b101],
    'O': [0b010, 0b101, 0b101, 0b101, 0b010],
    'P': [0b110, 0b101, 0b110, 0b100, 0b100],
    'Q': [0b010, 0b101, 0b101, 0b111, 0b011],
    'R': [0b110, 0b101, 0b110, 0b101, 0b101],
    'S': [0b011, 0b100, 0b010, 0b001, 0b110],
    'T': [0b111, 0b010, 0b010, 0b010, 0b010],
    'U': [0b101, 0b101, 0b101, 0b101, 0b011],
    'V': [0b101, 0b101, 0b101, 0b101, 0b010],
    'W': [0b101, 0b101, 0b101, 0b111, 0b101],
    'X': [0b101, 0b101, 0b010, 0b101, 0b101],
    'Y': [0b101, 0b101, 0b010, 0b010, 0b010],
    'Z': [0b111, 0b001, 0b010, 0b100, 0b111],
    ' ': [0b000, 0b000, 0b000, 0b000, 0b000],
};

function drawText(text, x, y, color) {
    let offsetX = 0;
    for (const char of text.toUpperCase()) {
        const pattern = FONT[char];
        if (pattern) {
            for (let rowIdx = 0; rowIdx < pattern.length; rowIdx++) {
                const row = pattern[rowIdx];
                for (let colIdx = 0; colIdx < 3; colIdx++) {
                    if ((row >> (2 - colIdx)) & 1) {
                        setPixel(x + offsetX + colIdx, y + rowIdx, color);
                    }
                }
            }
        }
        offsetX += 4;
    }
}

function createTaiwanFlag(x, y) {
    // Red flag background
    drawRect(x, y, 10, 7, PALETTE.taiwan_red);
    // Blue canton
    drawRect(x, y, 5, 4, PALETTE.taiwan_blue);
    // White circle (sun)
    for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 5; dx++) {
            const cx = x + 2 + dx;
            const cy = y + 1 + dy;
            const dist = Math.pow(cx - (x + 2.5), 2) / 2.5 + Math.pow(cy - (y + 2), 2) / 2;
            if (dist >= 0.8 && dist <= 1.8) {
                setPixel(cx, cy, PALETTE.white);
            }
        }
    }
    // Outline
    drawRect(x, y, 10, 1, PALETTE.dark_outline);
    drawRect(x, y + 6, 10, 1, PALETTE.dark_outline);
    drawRect(x, y, 1, 7, PALETTE.dark_outline);
    drawRect(x + 9, y, 1, 7, PALETTE.dark_outline);
}

function createJapanFlag(x, y) {
    // White flag background
    drawRect(x, y, 10, 7, PALETTE.white);
    // Red circle (sun)
    for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 10; dx++) {
            const cx = x + dx;
            const cy = y + dy;
            const dist = Math.pow(cx - (x + 5) + 0.5, 2) + Math.pow(cy - (y + 3.5), 2);
            if (dist <= 9) {
                setPixel(cx, cy, PALETTE.red);
            }
        }
    }
    // Outline
    drawRect(x, y, 10, 1, PALETTE.dark_outline);
    drawRect(x, y + 6, 10, 1, PALETTE.dark_outline);
    drawRect(x, y, 1, 7, PALETTE.dark_outline);
    drawRect(x + 9, y, 1, 7, PALETTE.dark_outline);
}

function drawHeart(x, y, color) {
    const heart = [
        [0,1,1,0,1,1,0,1,1,0],
        [1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,1,1,0,0],
        [0,0,0,1,1,1,1,0,0,0],
        [0,0,0,0,1,1,0,0,0,0],
    ];
    
    for (let rowIdx = 0; rowIdx < heart.length; rowIdx++) {
        const row = heart[rowIdx];
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
            if (row[colIdx]) {
                let pixelColor = color;
                if (rowIdx < 2) pixelColor = [255, 100, 130];
                else if (rowIdx >= 5) pixelColor = [180, 40, 60];
                setPixel(x + colIdx, y + rowIdx, pixelColor);
            }
        }
    }
}

function createTaiwanCharacter(startX, startY) {
    const headX = startX + 20;
    const headY = startY + 15;
    
    // Face (skin)
    for (let dy = 0; dy < 25; dy++) {
        for (let dx = 0; dx < 22; dx++) {
            setPixel(headX + dx, headY + dy, PALETTE.skin_light);
        }
    }
    
    // Hair (short dark hair)
    for (let dy = 0; dy < 12; dy++) {
        for (let dx = 0; dx < 24; dx++) {
            setPixel(headX - 1 + dx, headY - 2 + dy, PALETTE.hair_dark);
        }
    }
    for (let dy = 0; dy < 6; dy++) {
        for (let dx = 0; dx < 20; dx++) {
            setPixel(headX + 2 + dx, headY - 6 + dy, PALETTE.hair_dark);
        }
    }
    for (let dy = 0; dy < 8; dy++) {
        setPixel(headX - 1, headY + 4 + dy, PALETTE.hair_dark);
        setPixel(headX + 22, headY + 4 + dy, PALETTE.hair_dark);
    }
    
    // Eyes
    const eyeY = headY + 12;
    setPixel(headX + 5, eyeY, PALETTE.black);
    setPixel(headX + 6, eyeY, PALETTE.black);
    setPixel(headX + 5, eyeY + 1, PALETTE.black);
    setPixel(headX + 6, eyeY - 1, PALETTE.white);
    
    setPixel(headX + 14, eyeY, PALETTE.black);
    setPixel(headX + 15, eyeY, PALETTE.black);
    setPixel(headX + 15, eyeY + 1, PALETTE.black);
    setPixel(headX + 16, eyeY - 1, PALETTE.white);
    
    // Eyebrows
    setPixel(headX + 4, eyeY - 3, PALETTE.hair_dark);
    setPixel(headX + 5, eyeY - 3, PALETTE.hair_dark);
    setPixel(headX + 14, eyeY - 3, PALETTE.hair_dark);
    setPixel(headX + 15, eyeY - 3, PALETTE.hair_dark);
    
    // Happy smile
    const smileY = headY + 18;
    for (let dx = 0; dx < 6; dx++) {
        setPixel(headX + 7 + dx, smileY, PALETTE.black);
    }
    setPixel(headX + 6, smileY - 1, PALETTE.black);
    setPixel(headX + 13, smileY - 1, PALETTE.black);
    setPixel(headX + 8, smileY + 1, PALETTE.taiwan_red);
    setPixel(headX + 10, smileY + 1, PALETTE.taiwan_red);
    setPixel(headX + 9, smileY + 2, PALETTE.taiwan_red);
    
    // Blush
    setPixel(headX + 3, eyeY + 3, PALETTE.pink);
    setPixel(headX + 16, eyeY + 3, PALETTE.pink);
    
    // Body - White T-shirt
    const bodyY = headY + 26;
    for (let dy = 0; dy < 35; dy++) {
        for (let dx = 0; dx < 26; dx++) {
            setPixel(headX - 2 + dx, bodyY + dy, PALETTE.white);
        }
    }
    
    // T-shirt outline
    for (let dx = 0; dx < 26; dx++) {
        setPixel(headX - 2 + dx, bodyY, PALETTE.dark_outline);
        setPixel(headX - 2 + dx, bodyY + 34, PALETTE.dark_outline);
    }
    for (let dy = 0; dy < 35; dy++) {
        setPixel(headX - 2, bodyY + dy, PALETTE.dark_outline);
        setPixel(headX + 23, bodyY + dy, PALETTE.dark_outline);
    }
    
    // T-shirt text "TAIWAN"
    drawText("TAIWAN", headX - 1, bodyY + 8, PALETTE.taiwan_blue);
    
    // Small Taiwan flag on T-shirt
    createTaiwanFlag(headX + 1, bodyY + 16);
    
    // Left arm (holding bubble tea)
    const armY = bodyY + 5;
    for (let dy = 0; dy < 20; dy++) {
        setPixel(headX - 8, armY + dy, PALETTE.skin_light);
        setPixel(headX - 7, armY + dy, PALETTE.skin_light);
    }
    
    // Bubble tea cup
    const cupX = headX - 12;
    const cupY = armY + 8;
    for (let dy = 0; dy < 18; dy++) {
        for (let dx = 0; dx < 10; dx++) {
            setPixel(cupX + dx, cupY + dy, PALETTE.white);
        }
    }
    for (let dy = 0; dy < 18; dy++) {
        setPixel(cupX, cupY + dy, PALETTE.dark_outline);
        setPixel(cupX + 9, cupY + dy, PALETTE.dark_outline);
    }
    for (let dx = 0; dx < 10; dx++) {
        setPixel(cupX + dx, cupY, PALETTE.dark_outline);
        setPixel(cupX + dx, cupY + 17, PALETTE.dark_outline);
    }
    
    // Tea color (boba milk tea)
    for (let dy = 0; dy < 14; dy++) {
        for (let dx = 0; dx < 8; dx++) {
            setPixel(cupX + 1 + dx, cupY + 2 + dy, PALETTE.boba_brown);
        }
    }
    
    // Straw
    const strawX = cupX + 6;
    for (let dy = 0; dy < 25; dy++) {
        const strawColor = dy % 2 === 0 ? PALETTE.straw_color : PALETTE.red;
        setPixel(strawX, cupY - 12 + dy, strawColor);
        setPixel(strawX + 1, cupY - 12 + dy, strawColor);
    }
    
    // Boba bubbles
    const bubbles = [[2, 4], [5, 8], [3, 12], [6, 6], [4, 10]];
    for (const [bx, by] of bubbles) {
        setPixel(cupX + bx, cupY + by, PALETTE.bubble_black);
        setPixel(cupX + bx + 1, cupY + by, PALETTE.bubble_black);
        setPixel(cupX + bx, cupY + by + 1, PALETTE.bubble_black);
        setPixel(cupX + bx + 1, cupY + by + 1, PALETTE.bubble_black);
        setPixel(cupX + bx, cupY + by - 1, PALETTE.white);
    }
    
    // Right arm
    for (let dy = 0; dy < 25; dy++) {
        setPixel(headX + 25, armY + dy, PALETTE.skin_light);
        setPixel(headX + 26, armY + dy, PALETTE.skin_light);
    }
    
    // Green backpack strap
    for (let dy = 0; dy < 30; dy++) {
        setPixel(headX - 6, bodyY + 2 + dy, PALETTE.green_dark);
        if (dy % 4 < 2) {
            setPixel(headX - 5, bodyY + 2 + dy, PALETTE.green_light);
        }
    }
    
    // Green passport on waist
    const passportX = headX + 24;
    const passportY = bodyY + 28;
    for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 6; dx++) {
            setPixel(passportX + dx, passportY + dy, PALETTE.green_dark);
        }
    }
    setPixel(passportX + 2, passportY + 2, PALETTE.taiwan_red);
    setPixel(passportX + 3, passportY + 3, PALETTE.taiwan_red);
    
    // Legs
    const legY = bodyY + 35;
    for (let dy = 0; dy < 15; dy++) {
        setPixel(headX + 2, legY + dy, PALETTE.hair_dark);
        setPixel(headX + 3, legY + dy, PALETTE.hair_dark);
        setPixel(headX + 16, legY + dy, PALETTE.hair_dark);
        setPixel(headX + 17, legY + dy, PALETTE.hair_dark);
    }
}

function createJapanCharacter(startX, startY) {
    const headX = startX + 20;
    const headY = startY + 15;
    
    // Face (skin)
    for (let dy = 0; dy < 25; dy++) {
        for (let dx = 0; dx < 22; dx++) {
            setPixel(headX + dx, headY + dy, PALETTE.skin_tan);
        }
    }
    
    // Hair (short wavy dark hair)
    for (let dy = 0; dy < 15; dy++) {
        for (let dx = 0; dx < 26; dx++) {
            setPixel(headX - 2 + dx, headY - 4 + dy, PALETTE.hair_dark);
        }
    }
    for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 22; dx++) {
            setPixel(headX + dx, headY - 8 + dy, PALETTE.hair_dark);
        }
    }
    for (let dy = 0; dy < 12; dy++) {
        const offset = dy % 3 === 0 ? 1 : 0;
        setPixel(headX - 3 + offset, headY + 2 + dy, PALETTE.hair_dark);
        setPixel(headX + 24 - offset, headY + 2 + dy, PALETTE.hair_dark);
    }
    
    // Wavy hair strands
    for (let dy = 0; dy < 10; dy++) {
        setPixel(headX - 4, headY + 3 + dy, PALETTE.hair_dark);
        setPixel(headX + 25, headY + 3 + dy, PALETTE.hair_dark);
        if (dy % 4 === 0) {
            setPixel(headX - 5, headY + 4 + dy, PALETTE.hair_dark);
            setPixel(headX + 26, headY + 4 + dy, PALETTE.hair_dark);
        }
    }
    
    // Sakura flower accessory
    const sakuraX = headX + 16;
    const sakuraY = headY - 6;
    
    const petals = [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (const [px, py] of petals) {
        setPixel(sakuraX + px, sakuraY + py, PALETTE.sakura_pink);
        setPixel(sakuraX + px + 1, sakuraY + py, PALETTE.sakura_pink);
        setPixel(sakuraX + px, sakuraY + py + 1, PALETTE.sakura_pink);
    }
    setPixel(sakuraX, sakuraY, PALETTE.sakura_dark);
    setPixel(sakuraX + 1, sakuraY, PALETTE.sakura_dark);
    setPixel(sakuraX, sakuraY + 1, PALETTE.sakura_dark);
    setPixel(sakuraX + 1, sakuraY + 1, PALETTE.sakura_dark);
    
    // Eyes (gentle, feminine)
    const eyeY = headY + 12;
    // Left eye
    for (let dx = 0; dx < 3; dx++) {
        setPixel(headX + 5 + dx, eyeY, PALETTE.black);
        setPixel(headX + 5 + dx, eyeY + 1, PALETTE.black);
    }
    setPixel(headX + 4, eyeY - 1, PALETTE.hair_dark);
    setPixel(headX + 8, eyeY - 1, PALETTE.hair_dark);
    setPixel(headX + 6, eyeY - 1, PALETTE.white);
    setPixel(headX + 8, eyeY, PALETTE.white);
    
    // Right eye
    for (let dx = 0; dx < 3; dx++) {
        setPixel(headX + 13 + dx, eyeY, PALETTE.black);
        setPixel(headX + 13 + dx, eyeY + 1, PALETTE.black);
    }
    setPixel(headX + 12, eyeY - 1, PALETTE.hair_dark);
    setPixel(headX + 16, eyeY - 1, PALETTE.hair_dark);
    setPixel(headX + 14, eyeY - 1, PALETTE.white);
    setPixel(headX + 16, eyeY, PALETTE.white);
    
    // Gentle smile
    const smileY = headY + 18;
    for (let dx = 0; dx < 4; dx++) {
        setPixel(headX + 8 + dx, smileY, PALETTE.black);
    }
    setPixel(headX + 7, smileY - 1, PALETTE.black);
    setPixel(headX + 12, smileY - 1, PALETTE.black);
    
    // Rosy cheeks
    setPixel(headX + 3, eyeY + 2, PALETTE.sakura_pink);
    setPixel(headX + 4, eyeY + 2, PALETTE.sakura_pink);
    setPixel(headX + 15, eyeY + 2, PALETTE.sakura_pink);
    setPixel(headX + 16, eyeY + 2, PALETTE.sakura_pink);
    
    // Body - Red T-shirt
    const bodyY = headY + 26;
    for (let dy = 0; dy < 35; dy++) {
        for (let dx = 0; dx < 26; dx++) {
            setPixel(headX - 2 + dx, bodyY + dy, PALETTE.red);
        }
    }
    
    // T-shirt outline
    for (let dx = 0; dx < 26; dx++) {
        setPixel(headX - 2 + dx, bodyY, PALETTE.dark_outline);
        setPixel(headX - 2 + dx, bodyY + 34, PALETTE.dark_outline);
    }
    for (let dy = 0; dy < 35; dy++) {
        setPixel(headX - 2, bodyY + dy, PALETTE.dark_outline);
        setPixel(headX + 23, bodyY + dy, PALETTE.dark_outline);
    }
    
    // T-shirt text "JAPAN"
    drawText("JAPAN", headX, bodyY + 8, PALETTE.white);
    
    // Small Japan flag on T-shirt
    createJapanFlag(headX + 2, bodyY + 16);
    
    // Left arm (down)
    const armY = bodyY + 5;
    for (let dy = 0; dy < 25; dy++) {
        setPixel(headX - 8, armY + dy, PALETTE.skin_tan);
        setPixel(headX - 7, armY + dy, PALETTE.skin_tan);
    }
    
    // Right arm (waving)
    for (let dy = 0; dy < 20; dy++) {
        setPixel(headX + 25, armY - 2 + dy, PALETTE.skin_tan);
        setPixel(headX + 26, armY - 2 + dy, PALETTE.skin_tan);
    }
    
    // Legs
    const legY = bodyY + 35;
    for (let dy = 0; dy < 15; dy++) {
        setPixel(headX + 2, legY + dy, PALETTE.hair_dark);
        setPixel(headX + 3, legY + dy, PALETTE.hair_dark);
        setPixel(headX + 16, legY + dy, PALETTE.hair_dark);
        setPixel(headX + 17, legY + dy, PALETTE.hair_dark);
    }
}

function createPixelArt() {
    // Draw circular background
    const centerX = WIDTH / 2;
    const centerY = HEIGHT / 2 + 10;
    const radius = 70;
    
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
            if (dist <= radius) {
                const intensity = 1 - (dist / radius) * 0.3;
                const r = Math.floor(255 * intensity);
                const g = Math.floor(245 * intensity);
                const b = Math.floor(230 * intensity);
                setPixel(x, y, [r, g, b]);
            }
        }
    }
    
    // Decorative border
    for (let angle = 0; angle < 360; angle += 5) {
        const rad = angle * Math.PI / 180;
        for (let r = radius - 3; r < radius; r++) {
            const x = Math.floor(centerX + r * Math.cos(rad));
            const y = Math.floor(centerY + r * Math.sin(rad));
            if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
                setPixel(x, y, PALETTE.pink);
            }
        }
    }
    
    // Small flags in corners
    createTaiwanFlag(8, 10);
    createJapanFlag(WIDTH - 18, 10);
    
    // Create characters
    createTaiwanCharacter(8, 20);
    createJapanCharacter(WIDTH - 85, 20);
    
    // Heart connecting them
    drawHeart(centerX - 5, 50, PALETTE.heart_red);
    
    // "X" symbol
    drawText("X", 74, 30, PALETTE.dark_outline);
    
    // Decorative sparkles
    const sparkles = [[20, 20], [WIDTH - 25, 18], [15, HEIGHT - 30], [WIDTH - 20, HEIGHT - 35],
                      [centerX - 35, centerY - 45], [centerX + 25, centerY - 50]];
    
    for (const [sx, sy] of sparkles) {
        for (let i = -2; i <= 2; i++) {
            if (sx + i >= 0 && sx + i < WIDTH) {
                setPixel(sx + i, sy, PALETTE.pink);
            }
            if (sy + i >= 0 && sy + i < HEIGHT) {
                setPixel(sx, sy + i, PALETTE.pink);
            }
        }
        setPixel(sx, sy, PALETTE.white);
    }
    
    // Bottom text
    drawText("TAIWAN  X  JAPAN", centerX - 28, HEIGHT - 15, PALETTE.dark_outline);
}

// PNG encoder (minimal implementation)
function crc32(data) {
    let crc = 0xFFFFFFFF;
    const table = [];
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
    }
    for (let i = 0; i < data.length; i++) {
        crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createPNG(width, height, pixels) {
    const zlib = require('zlib');
    
    // Create raw image data (RGBA)
    const rawData = [];
    for (let y = 0; y < height; y++) {
        rawData.push(0); // Filter byte
        for (let x = 0; x < width; x++) {
            const color = pixels[y][x];
            rawData.push(color[0], color[1], color[2], 255);
        }
    }
    
    // Compress using zlib
    const compressed = zlib.deflateSync(Buffer.from(rawData));
    
    // PNG signature
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    
    // IHDR chunk
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // Bit depth
    ihdr[9] = 6;  // Color type (RGBA)
    ihdr[10] = 0; // Compression
    ihdr[11] = 0; // Filter
    ihdr[12] = 0; // Interlace
    
    const ihdrChunk = createChunk('IHDR', ihdr);
    
    // IDAT chunk
    const idatChunk = createChunk('IDAT', compressed);
    
    // IEND chunk
    const iendChunk = createChunk('IEND', Buffer.alloc(0));
    
    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    
    const typeBuffer = Buffer.from(type);
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData), 0);
    
    return Buffer.concat([length, typeBuffer, data, crc]);
}

// Main execution
console.log('Creating pixel art image...');
createPixelArt();

console.log('Encoding PNG...');
const png = createPNG(WIDTH, HEIGHT, pixels);

// Save the image
const fs = require('fs');
const outputPath = '/mnt/c/Users/wongo/OneDrive/Desktop/pc_dot_taiwan_japan.png';
fs.writeFileSync(outputPath, png);

console.log(`Image saved to: ${outputPath}`);
console.log(`Image size: ${WIDTH * PIXEL_SIZE}x${HEIGHT * PIXEL_SIZE} pixels (rendered)`);
console.log(`Raw pixel grid: ${WIDTH}x${HEIGHT} pixels`);
console.log('Pixel art style: 8-bit retro with visible dot grid');