# ERPNext Integration Requirements untuk POS PWA System

## Executive Summary

Berdasarkan analisis mendalam terhadap codebase POS PWA yang sudah dikembangkan, berikut adalah requirements lengkap untuk mengintegrasikan sistem dengan ERPNext. Project ini sudah memiliki struktur yang sangat solid dengan implementasi offline-first architecture, namun memerlukan beberapa customizations dan enhancements di sisi ERPNext.

## 🔍 Current State Analysis

### ✅ Yang Sudah Diimplementasikan (Sisi POS PWA):
- ERPNext API Client dengan authentication, retry logic, error handling
- TransactionQueueManager untuk offline storage dan sync
- SalesInvoiceMapper untuk mapping POS transactions ke ERPNext format
- MasterSyncService untuk coordinate sync operations
- DeltaSyncManager untuk incremental synchronization
- Complete POS functionality (barcode scanning, pricing engine, receipt printing)

### ❌ Yang Belum Diimplementasikan (Sisi ERPNext):
- Custom DocTypes untuk POS operations
- Device registration dan management system
- Enhanced APIs untuk offline-first sync
- 8-level pricing engine integration
- Batch transaction processing
- Conflict resolution mechanisms

---

## 📋 Critical Requirements

### 1. Custom DocTypes yang HARUS Dibuat

#### 1.1 POS Device DocType
```json
{
  "name": "POS Device",
  "fields": [
    {"fieldname": "device_id", "fieldtype": "Data", "reqd": 1, "unique": 1},
    {"fieldname": "device_name", "fieldtype": "Data", "reqd": 1},
    {"fieldname": "branch", "fieldtype": "Link", "options": "Branch"},
    {"fieldname": "company", "fieldtype": "Link", "options": "Company"},
    {"fieldname": "api_key", "fieldtype": "Data", "read_only": 1},
    {"fieldname": "api_secret", "fieldtype": "Data", "read_only": 1},
    {"fieldname": "registration_code", "fieldtype": "Data"},
    {"fieldname": "is_registered", "fieldtype": "Check", "default": 0},
    {"fieldname": "last_sync_at", "fieldtype": "Datetime"},
    {"fieldname": "sync_status", "fieldtype": "Select", "options": "Online\nOffline\nSyncing\nError"},
    {"fieldname": "last_heartbeat", "fieldtype": "Datetime"}
  ]
}
```

#### 1.2 POS Sync Log DocType
```json
{
  "name": "POS Sync Log",
  "fields": [
    {"fieldname": "device", "fieldtype": "Link", "options": "POS Device"},
    {"fieldname": "sync_type", "fieldtype": "Select", "options": "Master Data\nTransaction\nFull Sync\nManual Sync"},
    {"fieldname": "sync_status", "fieldtype": "Select", "options": "Started\nIn Progress\nCompleted\nFailed\nCancelled"},
    {"fieldname": "start_time", "fieldtype": "Datetime"},
    {"fieldname": "end_time", "fieldtype": "Datetime"},
    {"fieldname": "items_synced", "fieldtype": "Int", "default": 0},
    {"fieldname": "transactions_synced", "fieldtype": "Int", "default": 0},
    {"fieldname": "conflicts_detected", "fieldtype": "Int", "default": 0}
  ]
}
```

### 2. Custom Fields untuk DocTypes Existing

#### 2.1 Sales Invoice - Tambahkan Fields Ini:
```json
[
  {"fieldname": "pos_branch_id", "fieldtype": "Data"},
  {"fieldname": "pos_device_id", "fieldtype": "Data"},
  {"fieldname": "pos_transaction_id", "fieldtype": "Data"},
  {"fieldname": "pos_receipt_number", "fieldtype": "Data"},
  {"fieldname": "pos_sync_status", "fieldtype": "Select", "options": "Pending\nSynced\nFailed\nManual Review"},
  {"fieldname": "pos_sync_attempts", "fieldtype": "Int", "default": 0},
  {"fieldname": "pos_last_sync_attempt", "fieldtype": "Datetime"}
]
```

#### 2.2 Item Master - Tambahkan Fields Ini:
```json
[
  {"fieldname": "barcodes", "fieldtype": "Table", "options": "Item Barcode"},
  {"fieldname": "branch_prices", "fieldtype": "Table", "options": "Item Branch Price"},
  {"fieldname": "is_pos_item", "fieldtype": "Check", "default": 1},
  {"fieldname": "pos_display_order", "fieldtype": "Int"}
]
```

### 3. Custom Frappe App: "pos_integration"

#### 3.1 API Endpoints yang Harus Dibuat:

##### Device Registration Endpoint
```python
@frappe.whitelist()
def register_device(branch, device_name, registration_code):
    """Register new POS device"""
    # Validate registration code
    # Generate API key/secret
    # Create POS Device record
    # Return credentials
```

##### Master Data Sync Endpoint
```python
@frappe.whitelist()
def sync_master_data(device_id, last_sync_at, sync_type):
    """Sync master data with delta sync"""
    # Get items, pricing rules, users
    # Apply delta sync logic
    # Return synced data
```

##### Batch Transaction Processing Endpoint
```python
@frappe.whitelist()
def process_transaction_batch(device_id, transactions):
    """Process batch of transactions from POS"""
    # Validate transactions
    # Create Sales Invoices
    # Handle conflicts
    # Return processing results
```

##### Health Check Endpoint
```python
@frappe.whitelist()
def health_check(device_id):
    """Check system health for POS device"""
    # Check database connectivity
    # Check API performance
    # Return health status
```

### 4. Enhanced Pricing Engine (8-Level Hierarchy)

#### 4.1 Levels yang Harus Diimplementasikan:
1. **Base Item Price** - Standard item pricing
2. **Branch Price Override** - Branch-specific pricing
3. **Member/Customer Price** - Customer tier pricing
4. **Time-based Promotion** - Time-limited discounts
5. **Quantity Break Discount** - Bulk pricing
6. **Spend X Discount** - Total purchase discounts
7. **Buy X Get Y (BXGY)** - Promotional rules
8. **Manual Override** - Supervisor-approved overrides

#### 4.2 Pricing Rule Enhancements:
```json
{
  "Pricing Rule": [
    {"fieldname": "priority_level", "fieldtype": "Int", "options": "1-8"},
    {"fieldname": "branch_conditions", "fieldtype": "Table", "options": "Pricing Rule Branch"},
    {"fieldname": "valid_from", "fieldtype": "Datetime"},
    {"fieldname": "valid_upto", "fieldtype": "Datetime"},
    {"fieldname": "days_of_week", "fieldtype": "Table MultiSelect"},
    {"fieldname": "from_time", "fieldtype": "Time"},
    {"fieldname": "to_time", "fieldtype": "Time"}
  ]
}
```

### 5. Data Synchronization Enhancements

#### 5.1 Delta Sync Implementation
```python
def get_delta_sync_data(doctype, last_sync_at, branch_id):
    """Get data changes since last sync"""
    filters = [
        ["modified", ">", last_sync_at],
        ["docstatus", "<", 2]
    ]
    
    if branch_id:
        filters.append(["branch", "=", branch_id])
    
    return frappe.get_all(doctype, filters=filters, fields=["*"])
```

#### 5.2 Conflict Resolution
```python
def resolve_sync_conflict(entity_type, local_data, server_data, resolution_strategy):
    """Resolve data synchronization conflicts"""
    if resolution_strategy == "server_wins":
        return server_data
    elif resolution_strategy == "client_wins":
        return local_data
    elif resolution_strategy == "merge":
        return merge_data(local_data, server_data)
    else:
        # Manual resolution required
        return create_conflict_record(entity_type, local_data, server_data)
```

### 6. Security Enhancements

#### 6.1 Device Authentication
```python
def validate_device_auth(device_id, api_key, api_secret):
    """Validate device credentials"""
    device = frappe.get_doc("POS Device", {"device_id": device_id})
    
    if not device:
        return False, "Device not found"
    
    if device.api_key != api_key:
        return False, "Invalid API key"
    
    return True, "Valid device"
```

#### 6.2 Rate Limiting
```python
def check_rate_limit(device_id, endpoint, max_requests=100, window=3600):
    """Implement rate limiting per device"""
    cache_key = f"rate_limit_{device_id}_{endpoint}"
    current_requests = frappe.cache().get(cache_key) or 0
    
    if current_requests >= max_requests:
        return False, "Rate limit exceeded"
    
    frappe.cache().set(cache_key, current_requests + 1, window)
    return True, "Request allowed"
```

---

## 🚀 Implementation Priority

### Phase 1 (Critical - Week 1-2)
1. ✅ Create core DocTypes (POS Device, POS Sync Log)
2. ✅ Add custom fields to Sales Invoice
3. ✅ Implement basic device registration
4. ✅ Create core API endpoints

### Phase 2 (High - Week 3-4)
1. ✅ Implement 8-level pricing engine
2. ✅ Add batch transaction processing
3. ✅ Create delta sync mechanisms
4. ✅ Add performance monitoring

### Phase 3 (Medium - Week 5-6)
1. ✅ Implement conflict resolution
2. ✅ Add security enhancements
3. ✅ Create admin dashboard
4. ✅ Performance optimizations

---

## 📊 Success Metrics

### Technical Metrics
- **Sync Success Rate**: >99%
- **API Response Time**: <500ms for master data, <2s for transactions
- **Device Uptime**: >99.5%
- **Conflict Resolution Time**: <1 minute for automated, <1 hour for manual

### Business Metrics
- **Transaction Processing**: Real-time for online, <30s for offline sync
- **User Experience**: <3s app startup, <100ms barcode scan
- **Data Accuracy**: 100% transaction integrity
- **System Reliability**: Zero data loss, automatic recovery

---

## 🔧 Development Tools & Resources

### Required Tools
1. **ERPNext Development Environment**
   - Bench framework setup
   - Custom app development
   - Database migration tools

2. **Testing Environment**
   - Staging ERPNext instance
   - Multiple POS device simulators
   - Network condition simulators

### Documentation Requirements
1. **API Documentation**
   - Complete endpoint reference
   - Authentication guide
   - Error handling guide

2. **Administrator Guide**
   - Device management procedures
   - Sync monitoring and troubleshooting
   - Performance tuning guide

---

## ⚠️ Important Considerations

### Data Migration
- Plan for existing data migration if applicable
- Implement data validation during sync
- Create backup and rollback procedures

### Scalability
- Design for multiple branches and devices
- Implement efficient database queries
- Plan for high transaction volumes

### Security
- Implement proper authentication
- Secure API key management
- Audit logging for compliance

---

## 📞 Next Steps

1. **Review dan Approve** requirements dengan stakeholder
2. **Setup ERPNext development environment**
3. **Create project timeline dan resource allocation**
4. **Begin Phase 1 implementation**
5. **Establish testing procedures**

Requirements ini memastikan integrasi yang robust antara POS PWA system dengan ERPNext, dengan fokus pada reliability, performance, dan user experience.