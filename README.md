# Menu Selection System

A static web application for displaying menus and supporting multiple users to select dishes.

## Features

- 📋 **Menu Display**: Clearly displays all available dishes
- ✅ **Dish Selection**: Click to select/deselect dishes
- 👤 **Name Input**: Enter name for each selection
- ✔️ **Confirm Submission**: Generate summary page after confirming selection
- 📥 **Data Export**: Download all selection records (including name and order fields)
- 🖼️ **Image Management**: Upload and manage dish images
- 📊 **Order Management**: View and manage all orders
- 🔒 **Password Protection**: Manage Menu requires password (default: ashley)
- 🏪 **Restaurant Filtering**: Filter menu items by restaurant
- 👁️ **Restaurant Visibility**: Hide/show restaurants from menu

## Usage

1. **Start API Server** (required for MySQL mode):
   ```bash
   node api-server.js
   ```
   The API server will run on `http://localhost:3000`

2. **Open Application**:
   - Open `http://localhost:3000/index.html` in your browser
   - Or open `index.html` directly (for local storage mode)

3. **Browse Menu**:
   - Browse the menu and click dishes to select them
   - Use restaurant filter to filter by restaurant

4. **Submit Order**:
   - After selecting dishes, enter your name
   - Click the "Confirm" button to submit your selection

5. **Manage Data**:
   - Click "View Orders" to see all past orders
   - Click "Manage Menu" (password: ashley) to add, edit, or delete menu items
   - Use "Download" button to export data (CSV format)

## File Structure

```
menu/
├── README.md              # Project documentation
├── index.html             # Main page
├── styles.css             # Stylesheet
├── script.js              # Main application logic
├── mysql-db.js            # MySQL database operations (frontend)
├── api-server.js          # Node.js Express API server
├── mysql-schema.sql       # MySQL database schema
├── package.json           # Node.js dependencies
├── firebase-config.js     # Firebase configuration (legacy, not used)
├── firebase-db.js         # Firebase database operations (legacy, not used)
└── docs/                  # Documentation files
    ├── MIGRATION_COMPLETE.md
    ├── MYSQL_MIGRATION.md
    └── ...
```

## Data Storage

### Current: MySQL Database (via API Server)

- **Backend**: Node.js Express API server
- **Database**: MySQL
- **Features**:
  - ✅ Multi-user data sharing
  - ✅ Centralized data storage
  - ✅ Polling-based synchronization (2 second interval)
  - ✅ Reliable and scalable

### Configuration

**Environment Variables** (`.env` file):
```bash
# Copy .env.example to .env and fill in your values
DB_HOST=116.6.239.70
DB_PORT=20010
DB_NAME=order_menu
DB_USER=u_order_menu
DB_PASSWORD=your_password_here
PORT=3000
```

**Note**: Database credentials are now stored in environment variables for security. Create a `.env` file based on `.env.example` before running the server.

**Frontend Configuration** (`script.js`):
```javascript
const USE_MYSQL = true;  // Enable MySQL mode
const USE_FIREBASE = false;  // Disable Firebase
```

**API Base URL** (`mysql-db.js`):
```javascript
API_BASE_URL: '/api'  // For localhost
// For production: 'https://your-api-server.com/api'
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and fill in your database credentials:
```bash
DB_HOST=your_database_host
DB_PORT=your_database_port
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password
PORT=3000
```

### 3. Create Database Tables

```bash
# Using environment variables (recommended)
node create-tables.js

# Or manually with MySQL client
mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p $DB_NAME < mysql-schema.sql
```

Or use the test script:
```bash
node test-db-connection.js
```

### 4. Start API Server

Make sure you have created the `.env` file with your database credentials first!

```bash
node api-server.js
```

Or use npm:
```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in `PORT` environment variable).

### 5. Open Application

Open `http://localhost:3000/index.html` in your browser.

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/menu-items` - Get all menu items
- `POST /api/menu-items` - Save menu items
- `GET /api/orders` - Get all orders
- `POST /api/orders` - Save single order
- `POST /api/orders/batch` - Save multiple orders
- `DELETE /api/orders/:id` - Delete order
- `DELETE /api/orders` - Clear all orders
- `GET /api/settings/hiddenRestaurants` - Get hidden restaurants
- `PUT /api/settings/hiddenRestaurants` - Save hidden restaurants

## Customizing Menu

### Via Web Interface (Recommended)

1. Click "Manage Menu" button
2. Enter password: `ashley`
3. Use "Add Item" form to add new items
4. Click edit/delete buttons to modify existing items

### Via Code

Edit the `menuItems` array in `script.js` file:

```javascript
const menuItems = [
  { id: 1, name: 'Dish Name', category: 'Category', tag: 'Restaurant', price: 'Price', image: 'base64...' },
  // ... more dishes
];
```

## Production Deployment

### 1. Deploy API Server

Deploy `api-server.js` to a hosting service:
- Heroku
- Railway
- DigitalOcean
- AWS EC2
- Any Node.js hosting service

### 2. Update Frontend Configuration

Update `mysql-db.js`:
   ```javascript
API_BASE_URL: 'https://your-api-server.com/api'
```

### 3. Update Database Credentials

Update MySQL credentials in `api-server.js` if needed.

### 4. Test Production

- Test all functionality
- Monitor API server logs
- Check database connections

## Migration from Firestore

If you have existing Firestore data, use the migration tool:

1. Open `http://localhost:3000/quick-migrate.html`
2. Click "Start Migration"
3. Wait for migration to complete

Or use the export/import scripts:
- `export-firestore-data.html` - Export from Firestore
- `migrate-from-json.js` - Import to MySQL

## Technical Details

- **Frontend**: Pure HTML/CSS/JavaScript (static)
- **Backend**: Node.js Express API server
- **Database**: MySQL
- **Synchronization**: Polling (2 second interval)
- **Image Storage**: Base64 encoded in database
- **Export Format**: CSV
- **Responsive Design**: Supports mobile devices

## Browser Compatibility

Supports all modern browsers:
- Chrome (recommended)
- Firefox
- Safari
- Edge

## Troubleshooting

### API Server Not Responding

```bash
# Check if server is running
ps aux | grep "node api-server"

# Restart server
pkill -f "node api-server.js"
node api-server.js
```

### Database Connection Failed

1. Check MySQL credentials in `api-server.js`
2. Verify MySQL server is accessible
3. Check firewall rules

### No Menu Data Displayed

1. Check browser console (F12) for errors
2. Verify API server is running
3. Check `/api/menu-items` endpoint
4. Clear browser cache and refresh

### Migration Issues

See `MYSQL_MIGRATION.md` for detailed migration guide.

## Security Notes

- **Password Protection**: Manage Menu requires password (default: `ashley`)
- **API Security**: Consider adding authentication for production
- **Database Security**: Use strong passwords and restrict access
- **HTTPS**: Use HTTPS in production

## License

This project is for internal use only.
