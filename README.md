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

## Usage

1. Open `index.html` file directly in your browser
2. Browse the menu and click dishes to select them
3. After selecting dishes, enter your name
4. Click the "Confirm" button to submit your selection
5. View everyone's selections on the summary page
6. Click the "Download" button in the top right corner to export data (CSV format)
7. Use "Manage Menu" to add, edit, or delete menu items
8. Use "View Orders" to see all past orders

## File Structure

```
menu/
├── README.md          # Project documentation
├── index.html         # Main page
├── styles.css         # Stylesheet
├── script.js          # Functionality script
└── 星美乐Menu (1).pdf # Original menu PDF
```

## Customizing Menu

To modify menu content, edit the `menuItems` array in `script.js` file, format as follows:

```javascript
const menuItems = [
  { id: 1, name: 'Dish Name', category: 'Category', price: 'Price', image: 'base64...' },
  // ... more dishes
];
```

Or use the "Manage Menu" interface to add, edit, or delete items through the web interface.

## Technical Details

- Pure static page, no server required
- Uses localStorage to store selection data
- Supports CSV format export
- Responsive design, supports mobile devices
- Image compression and storage
- Order history management

## Browser Compatibility

Supports all modern browsers (Chrome, Firefox, Safari, Edge)
