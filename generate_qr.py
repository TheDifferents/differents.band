import qrcode
from qrcode.constants import ERROR_CORRECT_H
from qrcode.image.styles.moduledrawers import *
from qrcode.image.styles.colormasks import *
from qrcode.image.styledpil import StyledPilImage
from PIL import Image, ImageDraw, ImageOps, ImageFilter, ImageFont
import requests
from io import BytesIO
import os

def get_emoji_image():
    try:
        # Load the rockon.png image
        img = Image.open('images/rockon.png').convert('RGBA')
    except Exception as e:
        print(f"Error loading rockon.png: {e}")
        # Create a fallback transparent image
        size = 72
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    
    return img

def create_emoji_overlay(size, background_color="white"):
    # Create a new image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw a square background with the specified background color
    padding = size // 8
    if background_color and background_color != 'transparent':
        draw.rectangle([padding, padding, size - padding, size - padding], 
                      fill=background_color)
    
    # Get and resize the emoji
    emoji_img = get_emoji_image()
    if emoji_img:
        # Calculate emoji size (slightly smaller than the white square)
        emoji_size = int(size * 0.65)  # Reduced from 75% to 65% of the overlay size
        emoji_img = emoji_img.resize((emoji_size, emoji_size), Image.Resampling.LANCZOS)
        
        # Calculate position to center the emoji in the square
        x = (size - emoji_size) // 2
        y = (size - emoji_size) // 2
        
        # Create a mask from the alpha channel
        mask = emoji_img.split()[3]
        
        # Paste the emoji using the alpha channel as mask
        img.paste(emoji_img, (x, y), mask)
    else:
        # Fallback to text if emoji image is not available
        try:
            # Try to use SF Pro Text (macOS system font)
            font = ImageFont.truetype("/System/Library/Fonts/SFNSText.ttf", size//2)
        except:
            try:
                # Alternative path for SF Pro Text
                font = ImageFont.truetype("/System/Library/Fonts/SF-Pro-Text-Regular.otf", size//2)
            except:
                try:
                    # Another common location
                    font = ImageFont.truetype("/Library/Fonts/SF-Pro-Text-Regular.otf", size//2)
                except:
                    # Fallback to system default if SF Pro is not available
                    font = ImageFont.load_default()
        
        text = "\\m/"
        _, _, w, h = draw.textbbox((0, 0), text, font=font)
        x = (size - w) / 2
        y = (size - h) / 2
        # Use the fill color that contrasts with the background
        text_color = 'black' if background_color == 'white' else 'white'
        draw.text((x, y), text, font=font, fill=text_color)
    
    return img

def hex_to_rgb(hex_color):
    """Convert hex color string to RGB tuple."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def create_styled_qr(filename, style, fill_color='#bc1b24', back_color='white'):
    # Create qr directory if it doesn't exist
    os.makedirs('qr', exist_ok=True)
    
    qr = qrcode.QRCode(
        version=1,
        error_correction=ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data('https://differents.band')
    qr.make(fit=True)

    # Create basic QR with colors
    if back_color is None:
        # For transparent background, create white QR on black first
        qr_image = qr.make_image(
            fill_color='white',
            back_color='black'
        )
        
        # Convert to RGBA
        qr_image = qr_image.convert('RGBA')
        
        # Replace black pixels with transparent
        data = qr_image.getdata()
        new_data = []
        for item in data:
            # If pixel is black (background), make it transparent
            if item[:3] == (0, 0, 0):
                new_data.append((0, 0, 0, 0))
            else:
                new_data.append(item)  # Keep white pixels as is
        qr_image.putdata(new_data)
    else:
        # Normal colored QR code
        qr_image = qr.make_image(
            fill_color=fill_color,
            back_color=back_color
        )
        qr_image = qr_image.convert('RGBA')
    
    # Create emoji overlay with larger size (1/3 of QR code)
    overlay_size = qr_image.size[0] // 3
    overlay = create_emoji_overlay(overlay_size, None if back_color is None else back_color)
    
    # Calculate position to center the overlay
    x = (qr_image.size[0] - overlay_size) // 2
    y = (qr_image.size[1] - overlay_size) // 2
    
    # Paste the overlay
    qr_image.paste(overlay, (x, y), overlay)
    
    qr_image.save(f'qr/{filename}.png', 'PNG')

# Define color schemes to match website colors
COLOR_SCHEMES = {
    'red': {'fill': '#bc1b24', 'back': 'white'},     # Logo red
    'gold': {'fill': '#bc9c24', 'back': 'white'},    # Tip button gold
    'blue': {'fill': '#7cb4e3', 'back': 'white'},    # Follow button blue
    'navy': {'fill': '#0a192f', 'back': 'white'},    # Background dark blue
    'white-trans': {'fill': 'white', 'back': None},  # White on transparent
}

# Generate different styles with different colors
for style in ['circle', 'rounded', 'vertical', 'horizontal', 'square', 'gapped']:
    for color_name, colors in COLOR_SCHEMES.items():
        filename = f'differents_qr_{style}_{color_name}'
        create_styled_qr(filename, style, fill_color=colors['fill'], back_color=colors['back'])

print("QR codes have been generated in the qr directory:")
for style in ['circle', 'rounded', 'vertical', 'horizontal', 'square', 'gapped']:
    for color_name in COLOR_SCHEMES.keys():
        print(f"- differents_qr_{style}_{color_name}.png - {style.title()} pattern in {color_name}") 