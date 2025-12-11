# PDF Signature Injector

A web-based PDF editor that allows users to add text fields, signatures, images, dates, and radio buttons to PDF documents. The application features drag-and-drop functionality, field resizing, and coordinate normalization to ensure consistent placement across different screen sizes.

## Features

- **PDF Upload**: Drag-and-drop or click to upload PDF files
- **Field Types**:
  - Text input fields
  - Digital signature drawing
  - Image uploads
  - Date pickers
  - Radio buttons with labels
- **Interactive Editing**: Drag fields to reposition, resize using corner handles
- **Download**: Generate and download signed PDFs with all fields burned in
- **Coordinate Normalization**: Ensures fields appear in the exact same location regardless of screen size

## Tech Stack

### Frontend
- React.js
- PDF.js (PDF rendering)
- React Signature Canvas (signature drawing)
- Deployed on Vercel

### Backend
- Node.js + Express
- MongoDB + GridFS (PDF storage)
- pdf-lib (PDF manipulation)
- Deployed on Render

### Database
- MongoDB Atlas

## Project Structure

```
signature-injector/
├── backend/
│   ├── routes/
│   │   ├── upload.js       # PDF upload endpoint
│   │   ├── sign.js         # PDF signing & field burning
│   │   ├── files.js        # File download endpoint
│   │   ├── download.js     # PDF download handler
│   │   └── index.js        # Route aggregator
│   ├── server.js           # Express server setup
│   ├── package.json        # Backend dependencies
│   └── .env               # Environment variables
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── PdfEditor.js     # Main PDF editor component
    │   │   ├── PdfEditor.css    # Editor styling
    │   │   ├── DraggableField.js
    │   │   └── FieldOverlay.js
    │   ├── SignaturePad.js      # Signature drawing modal
    │   ├── PdfViewer.js         # PDF rendering component
    │   ├── FieldOverlay.js      # Field overlays and interactions
    │   ├── api.js               # API helper functions
    │   ├── App.js
    │   └── index.js
    ├── package.json             # Frontend dependencies
    └── public/
```

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- MongoDB Atlas account
- Git

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/signature_engine?retryWrites=true&w=majority&appName=Cluster0
PORT=5000
```

4. Start the server:
```bash
npm start
```

Backend runs on `http://localhost:5000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Update backend URL in code (if running locally):
   - Edit `src/components/PdfEditor.js`
   - Edit `src/PdfViewer.js`
   - Edit `src/api.js`
   - Replace `https://signature-injector-4.onrender.com` with `http://localhost:5000`

4. Start the development server:
```bash
npm start
```

Frontend runs on `http://localhost:3000`

## Deployment

### Backend (Render)
1. Push code to GitHub
2. Create new Web Service on Render
3. Connect GitHub repository
4. Set environment variables:
   - `MONGODB_URI`: Your MongoDB Atlas connection string
5. Deploy

### Frontend (Vercel)
1. Push code to GitHub
2. Import project on Vercel
3. Set root directory to `frontend`
4. Deploy
5. Update backend CORS to include your Vercel URL

### Update CORS in Backend
After deploying frontend, add your Vercel URL to `backend/server.js`:
```javascript
app.use(cors({
  origin: [
    "https://your-app.vercel.app",  // Add your Vercel URL here
    "http://localhost:3000"
  ],
  methods: ["GET", "POST"],
}));
```

## Key Implementation Details

### Coordinate System Normalization

The application uses percentage-based positioning to ensure fields appear in the correct location regardless of screen size.

**Problem**: CSS pixels don't match PDF.js viewport pixels, causing misalignment.

**Solution**: Scale factors normalize coordinates between display and actual dimensions.

#### Frontend (PdfEditor.js)

**Click Positioning** (Lines 213-219):
```javascript
const rect = e.currentTarget.getBoundingClientRect();
const x = (e.clientX - rect.left) * (meta.width / rect.width);
const y = (e.clientY - rect.top) * (meta.height / rect.height);
const leftPct = x / meta.width;
const topPct = y / meta.height;
```

**Drag Movement** (Lines 523-551):
```javascript
const scaleX = pdfWidth / parentRect.width;
const scaleY = pdfHeight / parentRect.height;

const dx = (mv.clientX - startX) * scaleX;
const dy = (mv.clientY - startY) * scaleY;

let newLeftPx = startLeftPx + dx;
let newTopPx = startTopPx + dy;
const newLeftPct = newLeftPx / pdfWidth;
const newTopPct = newTopPx / pdfHeight;
```

**Resize** (Lines 581-598):
Same normalization as drag movement.

#### Backend (sign.js)

Converts percentage coordinates to PDF points (Lines 79-86):
```javascript
const fieldLeft = f.leftPct * pageWidth;
const fieldTop = f.topPct * pageHeight;
const fieldW = f.widthPct * pageWidth;
const fieldH = f.heightPct * pageHeight;

// PDF coordinate system: bottom-left origin
const fieldBottomY = pageHeight - fieldTop - fieldH;
```

### Field Types Implementation

**Text Fields** (Lines 88-120): Left-aligned with padding, auto font-size adjustment

**Signatures/Images** (Lines 122-136): Embedded as PNG/JPG, aspect ratio preserved

**Date Fields** (Lines 138-175): Auto-format YYYY-MM-DD, center-aligned

**Radio Buttons** (Lines 177-232): Custom-drawn circles with blue fill when selected

## API Endpoints

### POST /upload-pdf
Upload PDF to GridFS storage
- **Request**: FormData with PDF file
- **Response**: `{ pdfId: string }`

### POST /sign-pdf
Burn fields into PDF and generate signed version
- **Request**: `{ pdfId: string, fields: Array }`
- **Response**: `{ signedPdfId: string, url: string, pdf: base64 }`

### GET /file/:id
Download signed PDF by ID
- **Response**: PDF file stream

## Environment Variables

### Backend (.env)
```
MONGODB_URI=<MongoDB Atlas connection string>
PORT=5000
```

### Frontend
No environment variables needed. Backend URLs are hardcoded in:
- `src/components/PdfEditor.js`
- `src/PdfViewer.js`
- `src/api.js`

## Database Collections

### pdfs.files
Stores PDF metadata (GridFS)
- filename
- uploadDate
- length
- contentType

### pdfs.chunks
Stores PDF binary data in 255KB chunks (GridFS)

### audits
Audit trail for signed PDFs
- pdfId
- signedPdfId
- originalHash (SHA-256)
- finalHash (SHA-256)
- fieldsProcessed
- createdAt

## Browser Compatibility

- Chrome/Edge (Recommended)
- Firefox
- Safari

## Known Issues

- PDF.js warning "TT: undefined function: 32" - cosmetic only, doesn't affect functionality
- Large PDFs (>10MB) may take longer to process

## License

This project is for educational purposes.

## Live Demo

- **Frontend**: https://signature-injector-weld.vercel.app
- **Backend**: https://signature-injector-4.onrender.com
