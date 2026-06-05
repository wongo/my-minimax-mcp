#!/usr/bin/env python3
"""
Pixel Art (Dot Style) PNG - Taiwan × Japan Friendship
8-bit retro style using visible dot/square pixels
"""

from PIL import Image, ImageDraw
import math

# Canvas size
WIDTH = 320
HEIGHT = 240
PIXEL_SIZE = 3  # Each "dot" is 3x3 pixels

# Create canvas
canvas = Image.new('RGB', (WIDTH, HEIGHT), 'white')
draw = ImageDraw.Draw(canvas)

# Limited color palette (8-bit retro style)
COLORS = {
    'white': (255, 255, 255),
    'cream': (250, 243, 235),
    'beige': (245, 230, 211),
    'skin': (245, 208, 197),
    'skin_shade': (220, 180, 165),
    'hair_dark': (44, 24, 16),
    'hair_brown': (61, 35, 23),
    'shirt_white': (255, 255, 255),
    'shirt_red': (204, 51, 51),
    'shirt_blue': (0, 102, 204),
    'pants': (61, 61, 92),
    'skirt_pink': (255, 228, 225),
    'green_dark': (46, 90, 60),
    'green_pass': (30, 58, 36),
    'line': (51, 51, 51),
    'black': (20, 20, 20),
    'eye_black': (26, 15, 10),
    'blush': (255, 182, 193),
    'sakura_pink': (255, 183, 197),
    'sakura_dark': (255, 105, 180),
    'boba_brown': (74, 55, 40),
    'tea_brown': (196, 164, 132),
    'straw_red': (255, 107, 107),
    'gold': (212, 175, 55),
    'japan_red': (188, 0, 45),
    'taiwan_blue': (0, 102, 204),
    'taiwan_red': (222, 0, 35),
    'heart_pink': (255, 110, 138),
    'gray': (136, 136, 136),
}

def dot(x, y, color):
    """Draw a pixel dot"""
    for dy in range(PIXEL_SIZE):
        for dx in range(PIXEL_SIZE):
            cx = x * PIXEL_SIZE + dx
            cy = y * PIXEL_SIZE + dy
            if 0 <= cx < WIDTH and 0 <= cy < HEIGHT:
                canvas.putpixel((cx, cy), color)

def dot_rect(x, y, w, h, color):
    """Draw filled rectangle with dots"""
    for py in range(h):
        for px in range(w):
            dot(x + px, y + py, color)

def dot_rect_outline(x, y, w, h, fill_color, line_color=None):
    """Draw rectangle outline with dots"""
    dot_rect(x, y, w, h, fill_color)
    if line_color:
        for px in range(w):
            dot(x + px, y, line_color)
            dot(x + px, y + h - 1, line_color)
        for py in range(h):
            dot(x, y + py, line_color)
            dot(x + w - 1, y + py, line_color)

# ============ BACKGROUND ============
# Main circular background
cx, cy, r = 160, 125, 75
for y in range(HEIGHT // PIXEL_SIZE):
    for x in range(WIDTH // PIXEL_SIZE):
        px = x * PIXEL_SIZE + PIXEL_SIZE // 2
        py = y * PIXEL_SIZE + PIXEL_SIZE // 2
        dist = math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
        if dist <= r:
            dot(x, y, COLORS['beige'])
        elif dist <= r + 2:
            dot(x, y, COLORS['cream'])

# ============ SMALL FLAGS ============
# Taiwan flag (top left of circle)
def draw_dot_flag(x, y, is_taiwan=True):
    flag_w, flag_h = 8, 6
    # White background
    dot_rect(x, y, flag_w, flag_h, COLORS['white'])
    dot_rect_outline(x, y, flag_w, flag_h, COLORS['white'], COLORS['line'])

    if is_taiwan:
        # Blue corner
        dot_rect(x, y, 3, 3, COLORS['taiwan_blue'])
        # Red circle (sun)
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                if dx*dx + dy*dy <= 4:
                    dot(x + 1 + dx, y + 1 + dy, COLORS['taiwan_red'])
    else:
        # Japan flag - red circle center
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                if dx*dx + dy*dy <= 9:
                    dot(x + 3 + dx, y + 3 + dy, COLORS['japan_red'])

draw_dot_flag(22, 18, is_taiwan=True)
draw_dot_flag(78, 18, is_taiwan=False)

# ============ TAIWAN GUY (Left side) ============
gx, gy = 58, 45

# Head
for y in range(gy, gy + 14):
    for x in range(gx, gx + 16):
        dist = math.sqrt((x - gx - 8) ** 2 / 1.5 + (y - gy - 7) ** 2)
        if dist <= 8:
            dot(x, y, COLORS['skin'])

# Hair
for y in range(gy - 4, gy + 4):
    for x in range(gx - 2, gx + 18):
        if y < gy or (y < gy + 2 and x < gx + 3) or (y < gy + 2 and x > gx + 12):
            dot(x, y, COLORS['hair_dark'])
        elif gy <= y < gy + 4:
            if x < gx + 2 or x > gx + 13:
                dot(x, y, COLORS['hair_dark'])

# Eyes (large anime pixel style)
for dy in range(-2, 3):
    for dx in range(-2, 3):
        if dx*dx + dy*dy <= 8:
            dot(gx + 4 + dx, gy + 6 + dy, COLORS['white'])
            dot(gx + 11 + dx, gy + 6 + dy, COLORS['white'])
for dy in range(-1, 2):
    for dx in range(-1, 2):
        if dx*dx + dy*dy <= 2:
            dot(gx + 5 + dx, gy + 7 + dy, COLORS['eye_black'])
            dot(gx + 12 + dx, gy + 7 + dy, COLORS['eye_black'])
# Eye highlights
dot(gx + 5, gy + 5, COLORS['white'])
dot(gx + 12, gy + 5, COLORS['white'])

# Blush
dot(gx + 2, gy + 10, COLORS['blush'])
dot(gx + 3, gy + 10, COLORS['blush'])
dot(gx + 12, gy + 10, COLORS['blush'])
dot(gx + 13, gy + 10, COLORS['blush'])

# Mouth (smile)
dot(gx + 6, gy + 11, COLORS['shirt_red'])
dot(gx + 7, gy + 12, COLORS['shirt_red'])
dot(gx + 8, gy + 11, COLORS['shirt_red'])
dot(gx + 9, gy + 11, COLORS['shirt_red'])

# Body/Shirt
body_x, body_y = gx - 6, gy + 14
dot_rect(body_x, body_y, 28, 22, COLORS['shirt_white'])
dot_rect_outline(body_x, body_y, 28, 22, COLORS['shirt_white'], COLORS['line'])

# TAIWAN text on shirt
for y_off in range(2):
    for x_off in range(6):
        c = 'TAIWAN'[y_off * 6 + x_off] if y_off * 6 + x_off < 6 else ' '
        if c != ' ':
            color = COLORS['taiwan_blue']
            dot(body_x + 11 + x_off, body_y + 8 + y_off, color)

# Green backpack strap
for y in range(body_y, body_y + 18):
    if y % 2 == 0:
        dot(body_x + 20, y, COLORS['green_dark'])

# Green passport on waist
pass_x, pass_y = body_x + 2, body_y + 16
dot_rect(pass_x, pass_y, 5, 7, COLORS['green_pass'])
dot_rect_outline(pass_x, pass_y, 5, 7, COLORS['green_pass'], COLORS['green_dark'])

# Arms
for y in range(body_y + 2, body_y + 14):
    dot(body_x - 3, y, COLORS['skin'])
    dot(body_x + 28, y, COLORS['skin'])

# Hands holding bubble tea
dot(body_x + 26, body_y + 12, COLORS['skin'])
dot(body_x + 27, body_y + 13, COLORS['skin'])

# Bubble tea cup
cup_x, cup_y = body_x + 24, body_y + 6
dot_rect(cup_x, cup_y, 6, 12, COLORS['white'])
dot_rect_outline(cup_x, cup_y, 6, 12, COLORS['white'], COLORS['line'])
# Tea color
dot_rect(cup_x + 1, cup_y + 3, 4, 8, COLORS['tea_brown'])
# Boba pearls
dot(cup_x + 1, cup_y + 8, COLORS['boba_brown'])
dot(cup_x + 3, cup_y + 9, COLORS['boba_brown'])
dot(cup_x + 4, cup_y + 7, COLORS['boba_brown'])
# Straw
for y in range(cup_y - 6, cup_y + 4):
    if y % 2 == 0:
        dot(cup_x + 3, y, COLORS['straw_red'])

# Pants
pants_x, pants_y = body_x + 2, body_y + 20
dot_rect(pants_x, pants_y, 10, 12, COLORS['pants'])
dot_rect(pants_x + 14, pants_y, 10, 12, COLORS['pants'])
dot_rect_outline(pants_x, pants_y, 10, 12, COLORS['pants'], COLORS['line'])
dot_rect_outline(pants_x + 14, pants_y, 10, 12, COLORS['pants'], COLORS['line'])

# ============ JAPAN GIRL (Right side) ============
jx, jy = 192, 45

# Head
for y in range(jy, jy + 14):
    for x in range(jx, jx + 16):
        dist = math.sqrt((x - jx - 8) ** 2 / 1.5 + (y - jy - 7) ** 2)
        if dist <= 8:
            dot(x, y, COLORS['skin'])

# Hair (wavy)
for y in range(jy - 4, jy + 6):
    for x in range(jx - 3, jx + 19):
        if y < jy or (x < jx + 2 and y < jy + 5) or (x > jx + 13 and y < jy + 5):
            dot(x, y, COLORS['hair_dark'])

# Hair waves (side)
for y in range(jy + 2, jy + 10):
    if y % 2 == 0:
        dot(jx - 2, y, COLORS['hair_dark'])
        dot(jx + 17, y, COLORS['hair_dark'])

# Sakura flower in hair
sakura_x, sakura_y = jx + 14, jy - 2
sakura_colors = [COLORS['sakura_pink'], COLORS['sakura_dark']]
for angle in range(0, 360, 72):
    rad = math.radians(angle)
    px = int(3 * math.cos(rad))
    py = int(3 * math.sin(rad))
    dot(sakura_x + px, sakura_y + py, COLORS['sakura_pink'])
dot(sakura_x, sakura_y, COLORS['gold'])

# Eyes
for dy in range(-2, 3):
    for dx in range(-3, 3):
        if dx*dx + dy*dy <= 9:
            dot(jx + 3 + dx, jy + 6 + dy, COLORS['white'])
            dot(jx + 11 + dx, jy + 6 + dy, COLORS['white'])
for dy in range(-1, 2):
    for dx in range(-2, 2):
        if dx*dx + dy*dy <= 4:
            dot(jx + 4 + dx, jy + 7 + dy, COLORS['eye_black'])
            dot(jx + 12 + dx, jy + 7 + dy, COLORS['eye_black'])
# Eye highlights
dot(jx + 4, jy + 5, COLORS['white'])
dot(jx + 12, jy + 5, COLORS['white'])

# Blush
dot(jx + 1, jy + 10, COLORS['blush'])
dot(jx + 2, jy + 10, COLORS['blush'])
dot(jx + 12, jy + 10, COLORS['blush'])
dot(jx + 13, jy + 10, COLORS['blush'])

# Mouth (gentle smile)
dot(jx + 6, jy + 11, COLORS['shirt_red'])
dot(jx + 7, jy + 12, COLORS['shirt_red'])
dot(jx + 8, jy + 11, COLORS['shirt_red'])
dot(jx + 9, jy + 11, COLORS['shirt_red'])

# Body/Shirt (red)
body_x, body_y = jx - 6, jy + 14
dot_rect(body_x, body_y, 28, 22, COLORS['shirt_red'])
dot_rect_outline(body_x, body_y, 28, 22, COLORS['shirt_red'], COLORS['line'])

# JAPAN text on shirt
for y_off in range(2):
    for x_off in range(5):
        c = 'JAPAN'[y_off * 5 + x_off] if y_off * 5 + x_off < 5 else ' '
        if c != ' ':
            color = COLORS['white']
            dot(body_x + 11 + x_off, body_y + 8 + y_off, color)

# Arms
for y in range(body_y + 2, body_y + 14):
    dot(body_x - 3, y, COLORS['skin'])
    dot(body_x + 28, y, COLORS['skin'])

# Skirt
skirt_x, skirt_y = body_x + 2, body_y + 18
dot_rect(skirt_x, skirt_y, 24, 14, COLORS['skirt_pink'])
dot_rect_outline(skirt_x, skirt_y, 24, 14, COLORS['skirt_pink'], COLORS['line'])

# ============ HEART CONNECTING THEM ============
heart_x, heart_y = 155, 130
heart_pattern = [
    [0,1,1,0,1,1,0],
    [1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1],
    [0,1,1,1,1,1,0],
    [0,0,1,1,1,0,0],
    [0,0,0,1,0,0,0],
]
for y, row in enumerate(heart_pattern):
    for x, val in enumerate(row):
        if val:
            dot(heart_x + x, heart_y + y, COLORS['heart_pink'])

# ============ TEXT ============
# "PC級生style" text at bottom (simplified pixel text)
text_y = 220
# Just draw a small heart as decorative element
dot(150, text_y, COLORS['heart_pink'])
dot(153, text_y, COLORS['heart_pink'])
dot(156, text_y, COLORS['heart_pink'])

# Save
output_path = '/mnt/c/Users/wongo/OneDrive/Desktop/pc_dot_taiwan_japan.png'
canvas.save(output_path)
print(f'Saved to {output_path}')
print(f'Size: {WIDTH}x{HEIGHT} pixels')
