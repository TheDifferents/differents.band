from http.server import HTTPServer, SimpleHTTPRequestHandler
import ssl
import webbrowser
import os

def run_server():
    # Set the port
    port = 8000
    
    # Create server
    server_address = ('', port)
    httpd = HTTPServer(server_address, SimpleHTTPRequestHandler)
    
    print(f"Server started at http://localhost:{port}")
    
    # Open the browser automatically
    webbrowser.open(f'http://localhost:{port}')
    
    # Start serving
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()

if __name__ == '__main__':
    run_server() 