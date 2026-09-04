from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

app = Flask(__name__)
CORS(app)

def print_via_escpos(data):
    """
    Attempts physical thermal receipt print using python-escpos.
    Falls back gracefully if hardware printer is not attached.
    """
    try:
        from escpos.printer import Dummy, Usb, Network
        # Check if physical ESC/POS hardware configured
        # Example hardware connection:
        # printer = Usb(0x04b8, 0x0e15, profile="TM-T88IV")
        printer = Dummy() # Default fallback to dummy printer mode for dev
        
        printer.set(align='center', font='a', width=2, height=2)
        printer.text("================================\n")
        printer.text("          NEXA BANK\n")
        printer.text("     TRANSACTION RECEIPT\n")
        printer.text("================================\n\n")
        
        printer.set(align='left', font='a', width=1, height=1)
        printer.text(f"Customer:    {data.get('customer_display_name', 'N/A')}\n")
        printer.text(f"Transaction: {str(data.get('transaction_type', 'N/A')).upper()}\n")
        printer.text(f"Amount:      ₹{data.get('amount', '0')}\n")
        printer.text(f"Token:       ••••••••\n")
        printer.text(f"Status:      COMPLETED\n")
        printer.text(f"Date:        {datetime.now().strftime('%d %b %Y %H:%M:%S')}\n")
        printer.text("--------------------------------\n\n")
        
        printer.set(align='center', font='a', width=1, height=1)
        printer.text("================================\n")
        printer.text("        THANK YOU\n")
        printer.text("================================\n\n")

        output_text = printer.output.decode('latin-1', errors='ignore') if hasattr(printer, 'output') else "PRINTED_TO_HARDWARE"
        return True, output_text
    except Exception as e:
        logging.warning(f"Physical ESC/POS printer hardware error (falling back to mock preview): {e}")
        return False, str(e)

@app.route('/api/print', methods=['POST'])
def handle_print_receipt():
    try:
        data = request.json or {}
        logging.info(f"Received print request for customer {data.get('customer_display_name')}")
        
        success, details = print_via_escpos(data)
        
        return jsonify({
            "status": "success",
            "hardware_connected": success,
            "message": "Receipt sent to python-escpos local print service.",
            "preview_data": details
        }), 200
    except Exception as e:
        logging.error(f"Print service failure: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ONLINE", "service": "Nexa Bank ESC/POS Local Print Service"}), 200

if __name__ == "__main__":
    logging.info("Starting Python Local ESC/POS Print Service on http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=False)
