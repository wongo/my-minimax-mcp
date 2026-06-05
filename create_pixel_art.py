#!/usr/bin/env python3
"""
Pixel Art Generator: Taiwan × Japan Friendship
Creates an 8-bit retro style PNG image with two characters
"""

from PIL import Image, ImageDraw

# Define limited color palette (16-bit retro style)
PALETTE = {
    # Skin tones
    'skin_light': (255, 220, 177),
    'skin_tan': (255, 200, 150),
    
    # Hair colors
    'hair_dark': (40, 30, 25),
    'hair_brown': (60, 40, 30),
    
    # Clothing colors
    'white': (255, 255, 255),
    'red': (220, 40, 60),
    'pink': (255, 150, 180),
    'light_pink': (255, 200, 210),
    
    # Taiwan theme
    'taiwan_red': (200, 30, 50),
    'taiwan_blue': (30, 80, 160),
    'boba_brown': (101, 67, 33),
    'boba_light': (139, 90, 43),
    'green_dark': (40, 120, 60),
    'green_light': (80, 160, 90),
    
    # Japan theme
    'sakura_pink': (255, 183, 197),
    'sakura_dark': (200, 100, 130),
    
    # Background & elements
    'bg_cream': (255, 245, 230),
    'bg_white': (255, 255, 255),
    'heart_red': (230, 50, 80),
    
    # Outlines
    'black': (30, 30, 30),
    'dark_outline': (20, 20, 20),
    
    # Accents
    'straw_color': (255, 180, 100),
    'bubble_black': (30, 30, 30),
}

def set_pixel(img, x, y, color, size=2):
    """Set a pixel block at the specified position"""
    if 0 <= x < img.width and 0 <= y < img.height:
        for dy in range(size):
            for dx in range(size):
                img.putpixel((x + dx, y + dy), color)

def draw_rect(img, x, y, w, h, color, pixel_size=2):
    """Draw a filled rectangle in pixel style"""
    for py in range(h):
        for px in range(w):
            set_pixel(img, x + px * pixel_size, y + py * pixel_size, color, pixel_size)

def draw_rect_outline(img, x, y, w, h, outline_color, fill_color, pixel_size=2, outline_width=1):
    """Draw rectangle with outline"""
    # Fill
    draw_rect(img, x, y, w, h, fill_color, pixel_size)
    # Outline - top and bottom
    for i in range(outline_width):
        draw_rect(img, x - i * pixel_size, y - i * pixel_size, w, outline_width, outline_color, pixel_size)
        draw_rect(img, x - i * pixel_size, y + h * pixel_size - outline_width * pixel_size, w, outline_width, outline_color, pixel_size)
        # Left and right
        draw_rect(img, x - i * pixel_size, y, outline_width, h, outline_color, pixel_size)
        draw_rect(img, x + w * pixel_size - outline_width * pixel_size, y, outline_width, h, outline_color, pixel_size)

def create_taiwan_flag(img, x, y, pixel_size=2):
    """Draw small Taiwan flag"""
    # Red flag background
    draw_rect(img, x, y, 10, 7, PALETTE['taiwan_red'], pixel_size)
    # Blue canton
    draw_rect(img, x, y, 5, 4, PALETTE['taiwan_blue'], pixel_size)
    # White circle (sun)
    for dy in range(4):
        for dx in range(5):
            cx, cy = x + 2 + dx, y + 1 + dy
            dist = ((cx - (x + 2.5)) ** 2 / 2.5 + (cy - (y + 2)) ** 2 / 2)
            if 0.8 <= dist <= 1.8:
                set_pixel(img, cx * pixel_size, cy * pixel_size, PALETTE['white'], pixel_size)
    # Outline
    draw_rect(img, x, y, 10, 1, PALETTE['dark_outline'], pixel_size)
    draw_rect(img, x, y + 7 - 1, 10, 1, PALETTE['dark_outline'], pixel_size)
    draw_rect(img, x, y, 1, 7, PALETTE['dark_outline'], pixel_size)
    draw_rect(img, x + 10 - 1, y, 1, 7, PALETTE['dark_outline'], pixel_size)

def create_japan_flag(img, x, y, pixel_size=2):
    """Draw small Japan flag"""
    # White flag background
    draw_rect(img, x, y, 10, 7, PALETTE['white'], pixel_size)
    # Red circle (sun)
    for dy in range(7):
        for dx in range(10):
            cx, cy = x + dx, y + dy
            dist = ((cx - (x + 5) + 0.5) ** 2 + (cy - (y + 3.5)) ** 2)
            if dist <= 9:
                set_pixel(img, cx * pixel_size, cy * pixel_size, PALETTE['red'], pixel_size)
    # Outline
    draw_rect(img, x, y, 10, 1, PALETTE['dark_outline'], pixel_size)
    draw_rect(img, x, y + 7 - 1, 10, 1, PALETTE['dark_outline'], pixel_size)
    draw_rect(img, x, y, 1, 7, PALETTE['dark_outline'], pixel_size)
    draw_rect(img, x + 10 - 1, y, 1, 7, PALETTE['dark_outline'], pixel_size)

def draw_text_pixels(img, text, x, y, color, pixel_size=2):
    """Draw simple pixel text (uppercase only)"""
    # Simple 3x5 pixel font
    font_patterns = {
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
        'N': [0b101, 0b111, 0b111, 0b101, 0b101],
        '×': [0b000, 0b100, 0b010, 0b100, 0b000],
        ' ': [0b000, 0b000, 0b000, 0b000, 0b000],
    }
    
    offset_x = 0
    for char in text.upper():
        if char in font_patterns:
            pattern = font_patterns[char]
            for row_idx, row in enumerate(pattern):
                for col_idx in range(3):
                    if (row >> (2 - col_idx)) & 1:
                        set_pixel(img, 
                                  (x + offset_x + col_idx) * pixel_size, 
                                  (y + row_idx) * pixel_size, 
                                  color, pixel_size)
            offset_x += 4
        else:
            offset_x += 4

def draw_heart(img, x, y, color, size=6, pixel_size=2):
    """Draw pixel heart"""
    heart = [
        [0,1,1,0,1,1,0],
        [1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1],
        [0,1,1,1,1,1,0],
        [0,0,1,1,1,0,0],
        [0,0,0,1,0,0,0],
    ]
    for row_idx, row in enumerate(heart):
        for col_idx, pixel in enumerate(row):
            if pixel:
                set_pixel(img, 
                          (x + col_idx) * pixel_size, 
                          (y + row_idx) * pixel_size, 
                          color, pixel_size)

def create_taiwan_character(img, start_x, start_y, pixel_size=2):
    """Create Taiwan guy character"""
    s = pixel_size  # shorthand
    
    # Head
    head_x = start_x + 20
    head_y = start_y + 15
    
    # Face (skin)
    for dy in range(25):
        for dx in range(22):
            set_pixel(img, (head_x + dx) * s, (head_y + dy) * s, PALETTE['skin_light'], s)
    
    # Hair (short dark hair)
    for dy in range(12):
        for dx in range(24):
            set_pixel(img, (head_x - 1 + dx) * s, (head_y - 2 + dy) * s, PALETTE['hair_dark'], s)
    # Hair top
    for dy in range(6):
        for dx in range(20):
            set_pixel(img, (head_x + 2 + dx) * s, (head_y - 6 + dy) * s, PALETTE['hair_dark'], s)
    # Side hair
    for dy in range(8):
        set_pixel(img, (head_x - 1) * s, (head_y + 4 + dy) * s, PALETTE['hair_dark'], s)
        set_pixel(img, (head_x + 22) * s, (head_y + 4 + dy) * s, PALETTE['hair_dark'], s)
    
    # Eyes
    eye_y = head_y + 12
    # Left eye
    set_pixel(img, (head_x + 5) * s, eye_y * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 6) * s, eye_y * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 5) * s, (eye_y + 1) * s, PALETTE['black'], s)
    # Highlight
    set_pixel(img, (head_x + 6) * s, (eye_y - 1) * s, PALETTE['white'], s)
    # Right eye
    set_pixel(img, (head_x + 14) * s, eye_y * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 15) * s, eye_y * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 15) * s, (eye_y + 1) * s, PALETTE['black'], s)
    # Highlight
    set_pixel(img, (head_x + 16) * s, (eye_y - 1) * s, PALETTE['white'], s)
    
    # Eyebrows
    set_pixel(img, (head_x + 4) * s, (eye_y - 3) * s, PALETTE['hair_dark'], s)
    set_pixel(img, (head_x + 5) * s, (eye_y - 3) * s, PALETTE['hair_dark'], s)
    set_pixel(img, (head_x + 14) * s, (eye_y - 3) * s, PALETTE['hair_dark'], s)
    set_pixel(img, (head_x + 15) * s, (eye_y - 3) * s, PALETTE['hair_dark'], s)
    
    # Happy smile
    smile_y = head_y + 18
    for dx in range(6):
        set_pixel(img, (head_x + 7 + dx) * s, smile_y * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 6) * s, (smile_y - 1) * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 13) * s, (smile_y - 1) * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 8) * s, (smile_y + 1) * s, PALETTE['taiwan_red'], s)
    set_pixel(img, (head_x + 10) * s, (smile_y + 1) * s, PALETTE['taiwan_red'], s)
    set_pixel(img, (head_x + 9) * s, (smile_y + 2) * s, PALETTE['taiwan_red'], s)
    
    # Blush
    set_pixel(img, (head_x + 3) * s, (eye_y + 3) * s, PALETTE['pink'], s)
    set_pixel(img, (head_x + 16) * s, (eye_y + 3) * s, PALETTE['pink'], s)
    
    # Body - White T-shirt
    body_y = head_y + 26
    for dy in range(35):
        for dx in range(26):
            set_pixel(img, (head_x - 2 + dx) * s, (body_y + dy) * s, PALETTE['white'], s)
    
    # T-shirt outline
    for dx in range(26):
        set_pixel(img, (head_x - 2 + dx) * s, body_y * s, PALETTE['dark_outline'], s)
        set_pixel(img, (head_x - 2 + dx) * s, (body_y + 35 - 1) * s, PALETTE['dark_outline'], s)
    for dy in range(35):
        set_pixel(img, (head_x - 2) * s, (body_y + dy) * s, PALETTE['dark_outline'], s)
        set_pixel(img, (head_x + 23) * s, (body_y + dy) * s, PALETTE['dark_outline'], s)
    
    # T-shirt text "TAIWAN"
    text_y = body_y + 8
    draw_text_pixels(img, "TAIWAN", head_x - 1, text_y, PALETTE['taiwan_blue'], s)
    
    # Small Taiwan flag on T-shirt
    create_taiwan_flag(img, head_x + 1, body_y + 16, s)
    
    # Arms
    # Left arm (holding bubble tea)
    arm_y = body_y + 5
    for dy in range(20):
        set_pixel(img, (head_x - 8) * s, (arm_y + dy) * s, PALETTE['skin_light'], s)
        set_pixel(img, (head_x - 7) * s, (arm_y + dy) * s, PALETTE['skin_light'], s)
    
    # Bubble tea cup
    cup_x = head_x - 12
    cup_y = arm_y + 8
    for dy in range(18):
        for dx in range(10):
            set_pixel(img, (cup_x + dx) * s, (cup_y + dy) * s, PALETTE['white'], s)
    # Cup outline
    for dy in range(18):
        set_pixel(img, cup_x * s, (cup_y + dy) * s, PALETTE['dark_outline'], s)
        set_pixel(img, (cup_x + 9) * s, (cup_y + dy) * s, PALETTE['dark_outline'], s)
    for dx in range(10):
        set_pixel(img, (cup_x + dx) * s, cup_y * s, PALETTE['dark_outline'], s)
        set_pixel(img, (cup_x + dx) * s, (cup_y + 17) * s, PALETTE['dark_outline'], s)
    
    # Tea color (boba milk tea)
    for dy in range(14):
        for dx in range(8):
            set_pixel(img, (cup_x + 1 + dx) * s, (cup_y + 2 + dy) * s, PALETTE['boba_brown'], s)
    
    # Straw
    straw_x = cup_x + 6
    for dy in range(25):
        color = PALETTE['straw_color'] if dy % 2 == 0 else PALETTE['red']
        set_pixel(img, straw_x * s, (cup_y - 12 + dy) * s, color, s)
        set_pixel(img, (straw_x + 1) * s, (cup_y - 12 + dy) * s, color, s)
    
    # Boba bubbles
    bubble_positions = [(2, 4), (5, 8), (3, 12), (6, 6), (4, 10)]
    for bx, by in bubble_positions:
        set_pixel(img, (cup_x + bx) * s, (cup_y + by) * s, PALETTE['bubble_black'], s)
        set_pixel(img, (cup_x + bx + 1) * s, (cup_y + by) * s, PALETTE['bubble_black'], s)
        set_pixel(img, (cup_x + bx) * s, (cup_y + by + 1) * s, PALETTE['bubble_black'], s)
        set_pixel(img, (cup_x + bx + 1) * s, (cup_y + by + 1) * s, PALETTE['bubble_black'], s)
        set_pixel(img, (cup_x + bx) * s, (cup_y + by - 1) * s, PALETTE['white'], s)
    
    # Right arm (down)
    for dy in range(25):
        set_pixel(img, (head_x + 25) * s, (arm_y + dy) * s, PALETTE['skin_light'], s)
        set_pixel(img, (head_x + 26) * s, (arm_y + dy) * s, PALETTE['skin_light'], s)
    
    # Green backpack strap
    for dy in range(30):
        set_pixel(img, (head_x - 6) * s, (body_y + 2 + dy) * s, PALETTE['green_dark'], s)
        if dy % 4 < 2:
            set_pixel(img, (head_x - 5) * s, (body_y + 2 + dy) * s, PALETTE['green_light'], s)
    
    # Green passport on waist
    passport_x = head_x + 24
    passport_y = body_y + 28
    for dy in range(8):
        for dx in range(6):
            set_pixel(img, (passport_x + dx) * s, (passport_y + dy) * s, PALETTE['green_dark'], s)
    # Passport detail
    set_pixel(img, (passport_x + 2) * s, (passport_y + 2) * s, PALETTE['taiwan_red'], s)
    set_pixel(img, (passport_x + 3) * s, (passport_y + 3) * s, PALETTE['taiwan_red'], s)
    
    # Legs (simple)
    leg_y = body_y + 35
    for dy in range(15):
        set_pixel(img, (head_x + 2) * s, (leg_y + dy) * s, PALETTE['hair_dark'], s)
        set_pixel(img, (head_x + 3) * s, (leg_y + dy) * s, PALETTE['hair_dark'], s)
        set_pixel(img, (head_x + 16) * s, (leg_y + dy) * s, PALETTE['hair_dark'], s)
        set_pixel(img, (head_x + 17) * s, (leg_y + dy) * s, PALETTE['hair_dark'], s)

def create_japan_character(img, start_x, start_y, pixel_size=2):
    """Create Japan girl character"""
    s = pixel_size
    
    # Head
    head_x = start_x + 20
    head_y = start_y + 15
    
    # Face (skin)
    for dy in range(25):
        for dx in range(22):
            set_pixel(img, (head_x + dx) * s, (head_y + dy) * s, PALETTE['skin_tan'], s)
    
    # Hair (short wavy dark hair)
    for dy in range(15):
        for dx in range(26):
            set_pixel(img, (head_x - 2 + dx) * s, (head_y - 4 + dy) * s, PALETTE['hair_dark'], s)
    # Hair top
    for dy in range(8):
        for dx in range(22):
            set_pixel(img, (head_x + 0 + dx) * s, (head_y - 8 + dy) * s, PALETTE['hair_dark'], s)
    # Wavy sides
    for dy in range(12):
        offset = 1 if dy % 3 == 0 else 0
        set_pixel(img, (head_x - 3 + offset) * s, (head_y + 2 + dy) * s, PALETTE['hair_dark'], s)
        set_pixel(img, (head_x + 24 - offset) * s, (head_y + 2 + dy) * s, PALETTE['hair_dark'], s)
    
    # Hair strands (wavy effect)
    for dy in range(10):
        set_pixel(img, (head_x - 4) * s, (head_y + 3 + dy) * s, PALETTE['hair_dark'], s)
        set_pixel(img, (head_x + 25) * s, (head_y + 3 + dy) * s, PALETTE['hair_dark'], s)
        if dy % 4 == 0:
            set_pixel(img, (head_x - 5) * s, (head_y + 4 + dy) * s, PALETTE['hair_dark'], s)
            set_pixel(img, (head_x + 26) * s, (head_y + 4 + dy) * s, PALETTE['hair_dark'], s)
    
    # Sakura flower accessory in hair
    sakura_x = head_x + 16
    sakura_y = head_y - 6
    
    # Sakura petals (5 petals)
    petal_positions = [
        (2, 0), (-2, 0), (0, 2), (0, -2),  # Cardinal
        (1, 1), (-1, 1), (1, -1), (-1, -1)  # Diagonal
    ]
    for px, py in petal_positions:
        set_pixel(img, (sakura_x + px) * s, (sakura_y + py) * s, PALETTE['sakura_pink'], s)
        set_pixel(img, (sakura_x + px + 1) * s, (sakura_y + py) * s, PALETTE['sakura_pink'], s)
        set_pixel(img, (sakura_x + px) * s, (sakura_y + py + 1) * s, PALETTE['sakura_pink'], s)
    
    # Sakura center
    set_pixel(img, sakura_x * s, sakura_y * s, PALETTE['sakura_dark'], s)
    set_pixel(img, (sakura_x + 1) * s, sakura_y * s, PALETTE['sakura_dark'], s)
    set_pixel(img, sakura_x * s, (sakura_y + 1) * s, PALETTE['sakura_dark'], s)
    set_pixel(img, (sakura_x + 1) * s, (sakura_y + 1) * s, PALETTE['sakura_dark'], s)
    
    # Eyes (gentle, feminine)
    eye_y = head_y + 12
    # Left eye
    set_pixel(img, (head_x + 5) * s, eye_y * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 6) * s, eye_y * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 7) * s, eye_y * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 5) * s, (eye_y + 1) * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 6) * s, (eye_y + 1) * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 7) * s, (eye_y + 1) * s, PALETTE['black'], s)
    # Lashes
    set_pixel(img, (head_x + 4) * s, (eye_y - 1) * s, PALETTE['hair_dark'], s)
    set_pixel(img, (head_x + 8) * s, (eye_y - 1) * s, PALETTE['hair_dark'], s)
    # Highlight
    set_pixel(img, (head_x + 6) * s, (eye_y - 1) * s, PALETTE['white'], s)
    set_pixel(img, (head_x + 8) * s, eye_y * s, PALETTE['white'], s)
    
    # Right eye
    set_pixel(img, (head_x + 13) * s, eye_y * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 14) * s, eye_y * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 15) * s, eye_y * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 13) * s, (eye_y + 1) * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 14) * s, (eye_y + 1) * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 15) * s, (eye_y + 1) * s, PALETTE['black'], s)
    # Lashes
    set_pixel(img, (head_x + 12) * s, (eye_y - 1) * s, PALETTE['hair_dark'], s)
    set_pixel(img, (head_x + 16) * s, (eye_y - 1) * s, PALETTE['hair_dark'], s)
    # Highlight
    set_pixel(img, (head_x + 14) * s, (eye_y - 1) * s, PALETTE['white'], s)
    set_pixel(img, (head_x + 16) * s, eye_y * s, PALETTE['white'], s)
    
    # Gentle smile
    smile_y = head_y + 18
    for dx in range(4):
        set_pixel(img, (head_x + 8 + dx) * s, smile_y * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 7) * s, (smile_y - 1) * s, PALETTE['black'], s)
    set_pixel(img, (head_x + 12) * s, (smile_y - 1) * s, PALETTE['black'], s)
    # Rosy cheeks
    set_pixel(img, (head_x + 3) * s, (eye_y + 2) * s, PALETTE['sakura_pink'], s)
    set_pixel(img, (head_x + 4) * s, (eye_y + 2) * s, PALETTE['sakura_pink'], s)
    set_pixel(img, (head_x + 15) * s, (eye_y + 2) * s, PALETTE['sakura_pink'], s)
    set_pixel(img, (head_x + 16) * s, (eye_y + 2) * s, PALETTE['sakura_pink'], s)
    
    # Body - Red T-shirt
    body_y = head_y + 26
    for dy in range(35):
        for dx in range(26):
            set_pixel(img, (head_x - 2 + dx) * s, (body_y + dy) * s, PALETTE['red'], s)
    
    # T-shirt outline
    for dx in range(26):
        set_pixel(img, (head_x - 2 + dx) * s, body_y * s, PALETTE['dark_outline'], s)
        set_pixel(img, (head_x - 2 + dx) * s, (body_y + 35 - 1) * s, PALETTE['dark_outline'], s)
    for dy in range(35):
        set_pixel(img, (head_x - 2) * s, (body_y + dy) * s, PALETTE['dark_outline'], s)
        set_pixel(img, (head_x + 23) * s, (body_y + dy) * s, PALETTE['dark_outline'], s)
    
    # T-shirt text "JAPAN"
    text_y = body_y + 8
    draw_text_pixels(img, "JAPAN", head_x, text_y, PALETTE['white'], s)
    
    # Small Japan flag on T-shirt
    create_japan_flag(img, head_x + 2, body_y + 16, s)
    
    # Arms
    # Left arm (down)
    arm_y = body_y + 5
    for dy in range(25):
        set_pixel(img, (head_x - 8) * s, (arm_y + dy) * s, PALETTE['skin_tan'], s)
        set_pixel(img, (head_x - 7) * s, (arm_y + dy) * s, PALETTE['skin_tan'], s)
    
    # Right arm (waving slightly)
    for dy in range(20):
        offset = dy // 5  # Slight wave
        set_pixel(img, (head_x + 25) * s, (arm_y - 2 + dy) * s, PALETTE['skin_tan'], s)
        set_pixel(img, (head_x + 26) * s, (arm_y - 2 + dy) * s, PALETTE['skin_tan'], s)
    
    # Legs (simple)
    leg_y = body_y + 35
    for dy in range(15):
        set_pixel(img, (head_x + 2) * s, (leg_y + dy) * s, PALETTE['hair_dark'], s)
        set_pixel(img, (head_x + 3) * s, (leg_y + dy) * s, PALETTE['hair_dark'], s)
        set_pixel(img, (head_x + 16) * s, (leg_y + dy) * s, PALETTE['hair_dark'], s)
        set_pixel(img, (head_x + 17) * s, (leg_y + dy) * s, PALETTE['hair_dark'], s)

def create_heart_connection(img, x, y, pixel_size=2):
    """Create heart connecting both characters"""
    s = pixel_size
    # Large heart in center
    heart_x = x
    heart_y = y
    
    heart_shape = [
        [0,1,1,0,1,1,0,1,1,0],
        [1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,1,1,0,0],
        [0,0,0,1,1,1,1,0,0,0],
        [0,0,0,0,1,1,0,0,0,0],
    ]
    
    for row_idx, row in enumerate(heart_shape):
        for col_idx, pixel in enumerate(row):
            if pixel:
                # Gradient effect
                if row_idx < 2:
                    color = (255, 100, 130)  # Lighter pink
                elif row_idx < 5:
                    color = PALETTE['heart_red']
                else:
                    color = (180, 40, 60)  # Darker red
                set_pixel(img, (heart_x + col_idx) * s, (heart_y + row_idx) * s, color, s)

def create_pixel_art():
    """Main function to create the pixel art image"""
    # Image dimensions (320x240 for good visibility)
    width = 320
    height = 240
    pixel_size = 2
    
    # Create new image with white background
    img = Image.new('RGB', (width, height), PALETTE['bg_white'])
    
    # Draw cream/beige circular background block
    center_x = width // 2
    center_y = height // 2 + 10
    radius = 95
    
    for y in range(height):
        for x in range(width):
            dist = ((x - center_x) ** 2 + (y - center_y) ** 2) ** 0.5
            if dist <= radius:
                # Create circular gradient effect
                intensity = 1 - (dist / radius) * 0.3
                r = int(255 * intensity)
                g = int(245 * intensity)
                b = int(230 * intensity)
                img.putpixel((x, y), (r, g, b))
    
    # Draw decorative border inside circle
    for angle in range(0, 360, 5):
        import math
        rad = math.radians(angle)
        for r in range(radius - 3, radius):
            x = int(center_x + r * math.cos(rad))
            y = int(center_y + r * math.sin(rad))
            if 0 <= x < width and 0 <= y < height:
                img.putpixel((x, y), PALETTE['pink'])
    
    # Small Taiwan flag (top left of circle area)
    create_taiwan_flag(img, 25, 25, pixel_size)
    
    # Small Japan flag (top right of circle area)
    create_japan_flag(img, width - 50, 25, pixel_size)
    
    # Create Taiwan character (left side)
    create_taiwan_character(img, 25, 50, pixel_size)
    
    # Create Japan character (right side)
    create_japan_character(img, width - 145, 50, pixel_size)
    
    # Create heart connecting them
    heart_x = center_x - 10
    heart_y = 85
    create_heart_connection(img, heart_x, heart_y, pixel_size)
    
    # Add "×" symbol between characters
    draw_text_pixels(img, "X", 148, 40, PALETTE['dark_outline'], pixel_size)
    
    # Add decorative sparkles/stars around the circle
    sparkle_positions = [
        (50, 50), (width - 40, 45), (45, height - 60), (width - 35, height - 65),
        (center_x - 60, center_y - 70), (center_x + 50, center_y - 75)
    ]
    
    for sx, sy in sparkle_positions:
        # 4-point star
        for i in range(-2, 3):
            if 0 <= sx + i < width and 0 <= sy < height:
                img.putpixel((sx + i, sy), PALETTE['pink'])
            if 0 <= sx < width and 0 <= sy + i < height:
                img.putpixel((sx, sy + i), PALETTE['pink'])
        set_pixel(img, sx * pixel_size, sy * pixel_size, PALETTE['white'], pixel_size)
    
    # Add "FRIENDSHIP" text at bottom
    draw_text_pixels(img, "TAIWAN  X  JAPAN", center_x - 42, height - 25, PALETTE['dark_outline'], pixel_size)
    
    return img

if __name__ == "__main__":
    print("Creating pixel art image...")
    img = create_pixel_art()
    
    # Save the image
    output_path = "/mnt/c/Users/wongo/OneDrive/Desktop/pc_dot_taiwan_japan.png"
    img.save(output_path, 'PNG')
    print(f"Image saved to: {output_path}")
    
    # Also display some info
    print(f"Image size: {img.width}x{img.height} pixels")
    print("Pixel art style: 8-bit retro with visible dot grid")
