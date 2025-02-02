import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image

# Create QR code instance
qr = qrcode.QRCode(
    version=1,
    error_correction=ERROR_CORRECT_H,
    box_size=10,
    border=4,
)

# Add the data
qr.add_data('https://differents.band')
qr.make(fit=True)

# Create the QR code image with custom colors
qr_image = qr.make_image(
    fill_color="#bc1b24",  # Red color from your website
    back_color="white"
)

# Save the QR code
qr_image.save('images/differents_qr.png')
print("QR code has been generated as 'images/differents_qr.png'") 