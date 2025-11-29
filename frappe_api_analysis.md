# Frappe/ERPNext REST API Analysis

## Core REST API Capabilities (Extracted from Documentation)

### 1. Authentication Methods

#### Token-Based Authentication (Recommended for POS)
- **Endpoint**: Generate API Key/Secret in User Settings
- **Header**: `Authorization: token api_key:api_secret`
- **Benefits**: Stateless, role-based access, better security
- **Use Case**: Perfect for POS systems that need consistent user context

#### Password-Based Authentication
- **Endpoint**: `POST /api/method/login`
- **Method**: Session-based with cookies
- **Limitations**: Requires session management, less suitable for offline-first

#### OAuth Access Token
- **Header**: `Authorization: Bearer access_token`
- **Use Case**: External integrations and third-party apps

### 2. CRUD Operations for All DocTypes

#### Standard Endpoints
```http
GET    /api/resource/{doctype}              # List documents
POST   /api/resource/{doctype}              # Create document
GET    /api/resource/{doctype}/{name}       # Get single document
PUT    /api/resource/{doctype}/{name}       # Update document
DELETE /api/resource/{doctype}/{name}       # Delete document
```

#### Query Parameters
- `fields=["field1", "field2"]` - Specify fields to fetch
- `expand=["link_field"]` - Expand linked documents
- `filters=[["field", "operator", "value"]]` - Filter records
- `or_filters=[["field", "operator", "value"]]` - OR filters
- `order_by=fieldname desc` - Sorting
- `limit_start=X&limit_page_length=Y` - Pagination
- `as_dict=False` - Return as arrays instead of objects
- `debug=True` - Query debugging

### 3. Remote Method Calls
```http
GET    /api/method/{module}.{method}        # Execute whitelisted methods
POST   /api/method/{module}.{method}        # Execute with data modification
```

### 4. File Upload Support
- **Endpoint**: `POST /api/method/upload_file`
- **Content-Type**: `multipart/form-data`

### 5. Key Features for POS Integration
- **Automatic CRUD generation** for all DocTypes
- **Built-in filtering and pagination**
- **Query debugging capability**
- **Expandable linked documents**
- **Custom method execution**

## Data Structure
- **Default page size**: 20 records
- **Response format**: `{"data": [...]}`
- **Document fields**: All standard fields + custom fields
- **Link field expansion**: Available

## Next Research Areas
1. ERPNext-specific DocTypes (Item, Sales Invoice, etc.)
2. Rate limiting policies
3. Webhook availability
4. Delta sync mechanisms
5. Bulk operations support
6. Offline-specific considerations