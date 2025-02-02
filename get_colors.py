from colorthief import ColorThief
from PIL import Image
import webcolors
import os

def rgb_to_hex(rgb):
    return '#{:02x}{:02x}{:02x}'.format(rgb[0], rgb[1], rgb[2])

def get_dominant_colors(image_path, num_colors=3):
    try:
        color_thief = ColorThief(image_path)
        
        # Get the dominant color palette
        palette = color_thief.get_palette(color_count=num_colors, quality=10)
        
        print("\nDominant colors found in the logo:")
        for i, color in enumerate(palette):
            hex_color = rgb_to_hex(color)
            print(f"Color {i+1}: RGB{color} / HEX: {hex_color}")
            
        return palette
    except Exception as e:
        print(f"Error processing image: {e}")
        return None

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    logo_path = os.path.join(script_dir, "images", "logo.png")
    
    if os.path.exists(logo_path):
        colors = get_dominant_colors(logo_path)
    else:
        print(f"Could not find logo at: {logo_path}") 