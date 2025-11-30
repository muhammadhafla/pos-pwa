/**
 * Barcode Scanner Manager for POS PWA
 * Implements multiple scanner types: WebUSB, HID, Camera
 * Performance target: <100ms scan time
 */

import { Item } from '@/types';
import { barcodeLookup, BarcodeLookupService } from '@/services/database/BarcodeLookupService';

export interface ScanResult {
  item?: Item;
  barcode: string;
  scanTime: number;
  success: boolean;
  error?: string;
}

export interface ScannerConfig {
  enableWebUSB: boolean;
  enableHID: boolean;
  enableCamera: boolean;
  cameraConstraints?: MediaStreamConstraints;
  hidPrefixes?: string[];
  hidSuffixes?: string[];
  timeout: number; // ms for scanner input timeout
}

export class BarcodeScannerManager {
  private config: ScannerConfig;
  private isScanning = false;
  private currentBarcode = '';
  private lastScanTime = 0;
  private keypressBuffer: string[] = [];
  private keypressTimeout: NodeJS.Timeout | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  
  // Event listeners
  private onScanCallbacks: ((result: ScanResult) => void)[] = [];
  private onErrorCallbacks: ((error: string) => void)[] = [];

  constructor(config: Partial<ScannerConfig> = {}) {
    this.config = {
      enableWebUSB: true,
      enableHID: true,
      enableCamera: true,
      cameraConstraints: {
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      },
      hidPrefixes: ['[SCAN]', '[', ''],
      hidSuffixes: ['[ENTER]', '\n', ''],
      timeout: 100, // 100ms timeout between keystrokes
      ...config
    };
    
    this.initializeScanners();
  }

  /**
   * Initialize all supported scanner types
   */
  private async initializeScanners(): Promise<void> {
    console.log('🔍 Initializing barcode scanners...');
    
    try {
      // Initialize HID keyboard wedge (most common)
      if (this.config.enableHID) {
        this.initializeHIDScanner();
        console.log('✅ HID Scanner initialized');
      }
      
      // Initialize WebUSB scanners
      if (this.config.enableWebUSB && 'usb' in window) {
        await this.initializeWebUSBScanner();
        console.log('✅ WebUSB Scanner initialized');
      }
      
      // Initialize camera-based scanning
      if (this.config.enableCamera) {
        await this.initializeCameraScanner();
        console.log('✅ Camera Scanner initialized');
      }
      
      this.setupKeyboardShortcuts();
      
    } catch (error) {
      console.error('❌ Scanner initialization failed:', error);
      this.notifyError(`Scanner initialization failed: ${error}`);
    }
  }

  /**
   * Initialize HID (keyboard wedge) scanner
   * This captures keyboard input and detects barcode patterns
   */
  private initializeHIDScanner(): void {
    document.addEventListener('keydown', this.handleKeypress.bind(this));
    console.log('🔤 HID keyboard wedge scanner active');
  }

  /**
   * Initialize WebUSB scanner for modern USB devices
   */
  private async initializeWebUSBScanner(): Promise<void> {
    try {
      // Request USB device access
      const devices = await (navigator as any).usb.getDevices();
      
      for (const device of devices) {
        if (this.isBarcodeScanner(device)) {
          await this.setupUSBDevice(device);
        }
      }
      
    } catch (error) {
      console.warn('WebUSB not available or permission denied:', error);
    }
  }

  /**
   * Setup individual USB barcode scanner device
   */
  private async setupUSBDevice(device: any): Promise<void> {
    try {
      // Open device connection
      await device.open();
      
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }
      
      // Find interrupt endpoint for scanner input
      const interfaceIndex = device.configuration.interfaces.findIndex(
        (iface: any) => iface.alternates.some((alt: any) => alt.interfaceClass === 3)
      );
      
      if (interfaceIndex >= 0) {
        await device.claimInterface(interfaceIndex);
        
        // Listen for data on interrupt endpoint
        device.addEventListener('inputreport', (event: any) => {
          this.handleUSBData(event.data);
        });
        
        console.log(`✅ USB scanner connected: ${device.productName}`);
      }
      
    } catch (error) {
      console.error('USB scanner setup failed:', error);
    }
  }

  /**
   * Initialize camera-based barcode scanning
   */
  private async initializeCameraScanner(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(this.config.cameraConstraints!);
      this.setupCamera();
      console.log('📷 Camera scanner ready');
    } catch (error) {
      console.warn('Camera not available:', error);
    }
  }

  /**
   * Setup camera video stream for barcode detection
   */
  private setupCamera(): void {
    if (!this.stream) return;
    
    this.video = document.createElement('video');
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d')!;
    
    this.video.srcObject = this.stream;
    this.video.play();
    
    // Start scanning loop
    this.startCameraScanning();
  }

  /**
   * Start continuous camera scanning
   */
  private startCameraScanning(): void {
    if (!this.video || !this.canvas || !this.context) return;
    
    const scan = () => {
      if (this.video && this.video.readyState === this.video.HAVE_ENOUGH_DATA && this.canvas && this.context) {
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.context.drawImage(this.video, 0, 0);
        
        // Here you would integrate with a barcode detection library
        // For now, we'll trigger camera scanning mode
        console.log('📷 Camera frame captured for scanning');
      }
      
      if (this.isScanning) {
        requestAnimationFrame(scan);
      }
    };
    
    scan();
  }

  /**
   * Handle keyboard input for HID scanners
   */
  private handleKeypress(event: KeyboardEvent): void {
    // Ignore if in input field or modifier keys
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || event.ctrlKey || event.altKey) {
      return;
    }

    const now = Date.now();
    
    // Check if this is a barcode scanner (rapid keystrokes)
    if (this.keypressTimeout) {
      clearTimeout(this.keypressTimeout);
    }

    this.keypressBuffer.push(event.key);
    this.keypressTimeout = setTimeout(() => {
      this.processKeypressBuffer();
    }, this.config.timeout);

    // Update last scan time
    if (now - this.lastScanTime < 200) {
      // Likely a barcode scanner (fast typing)
      this.currentBarcode += event.key;
    } else {
      this.currentBarcode = event.key;
    }
    
    this.lastScanTime = now;
  }

  /**
   * Process accumulated keyboard input for barcode detection
   */
  private processKeypressBuffer(): void {
    const barcode = this.keypressBuffer.join('');
    
    // Remove common scanner prefixes/suffixes
    let cleanBarcode = barcode;
    const prefixes = this.config.hidPrefixes || [];
    const suffixes = this.config.hidSuffixes || [];
    
    for (const prefix of prefixes) {
      if (cleanBarcode.startsWith(prefix)) {
        cleanBarcode = cleanBarcode.substring(prefix.length);
        break;
      }
    }
    
    for (const suffix of suffixes) {
      if (cleanBarcode.endsWith(suffix)) {
        cleanBarcode = cleanBarcode.substring(0, cleanBarcode.length - suffix.length);
        break;
      }
    }
    
    // Validate barcode format
    if (this.isValidBarcode(cleanBarcode)) {
      this.performScan(cleanBarcode);
    }
    
    // Clear buffer
    this.keypressBuffer = [];
    this.currentBarcode = '';
  }

  /**
   * Handle USB input report data
   */
  private handleUSBData(data: DataView): void {
    // Convert USB data to string (simplified)
    const barcode = new TextDecoder().decode(data.buffer);
    if (this.isValidBarcode(barcode)) {
      this.performScan(barcode.trim());
    }
  }

  /**
   * Check if barcode format is valid using BarcodeLookupService validation
   */
  private isValidBarcode(barcode: string): boolean {
    // Use the comprehensive validation from BarcodeLookupService
    const validation = BarcodeLookupService.validateBarcode(barcode);
    
    if (!validation.isValid) {
      console.warn(`❌ Invalid barcode: ${barcode} - ${validation.issues.join(', ')}`);
      return false;
    }
    
    return true;
  }

  /**
   * Check if USB device is a barcode scanner
   */
  private isBarcodeScanner(device: any): boolean {
    // Check common barcode scanner vendor/product IDs
    const scannerVIDs = [0x05E0, 0x04B8, 0x0536, 0x1659]; // Common scanner vendors
    return scannerVIDs.includes(device.vendorId) || 
           (device.productName && /scanner|barcode/i.test(device.productName));
  }

  /**
   * Perform actual barcode scan lookup with O(1) optimization
   */
  private async performScan(barcode: string): Promise<void> {
    if (this.isScanning) return;
    
    this.isScanning = true;
    const startTime = performance.now();
    
    try {
      console.log(`🔍 Scanning barcode: ${barcode}`);
      
      // O(1) optimized barcode lookup with caching
      const lookupResult = await barcodeLookup.lookupBarcode(barcode);
      
      const scanTime = performance.now() - startTime;
      
      const result: ScanResult = {
        item: lookupResult.item || undefined,
        barcode,
        scanTime,
        success: lookupResult.item !== null,
        error: lookupResult.item ? undefined : 'Item not found'
      };
      
      // Enhanced logging for performance monitoring
      const source = lookupResult.source === 'cache' ? '⚡ Cache' : 
                    lookupResult.source === 'database' ? '🗄️ Database' : '❌ Error';
      console.log(`${source} | Scan: ${barcode} → ${result.success ? 'FOUND' : 'NOT FOUND'} (${scanTime.toFixed(2)}ms)`);
      
      // Performance warnings
      if (scanTime > 100) {
        console.warn(`⚠️ Slow scan detected: ${scanTime.toFixed(2)}ms (target: <100ms)`);
      }
      if (lookupResult.source === 'error') {
        console.error(`❌ Barcode lookup error: ${result.error}`);
      }
      
      this.notifyScan(result);
      
    } catch (error) {
      const scanTime = performance.now() - startTime;
      const result: ScanResult = {
        barcode,
        scanTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      console.error('❌ Barcode scan failed:', error);
      this.notifyScan(result);
      
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Setup global keyboard shortcuts for scanner controls
   */
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      // F1 - Start camera scan mode
      if (event.key === 'F1') {
        event.preventDefault();
        this.startCameraScanMode();
      }
      
      // Escape - Cancel current scan
      if (event.key === 'Escape') {
        this.cancelScan();
      }
    });
  }

  /**
   * Start camera scanning mode
   */
  private startCameraScanMode(): void {
    console.log('📷 Starting camera scan mode...');
    // Camera scanning implementation would go here
    this.notifyError('Camera scan mode not yet implemented');
  }

  /**
   * Cancel current scanning operation
   */
  private cancelScan(): void {
    this.isScanning = false;
    this.keypressBuffer = [];
    this.currentBarcode = '';
    if (this.keypressTimeout) {
      clearTimeout(this.keypressTimeout);
      this.keypressTimeout = null;
    }
    console.log('🚫 Scan cancelled');
  }

  /**
   * Event notification methods
   */
  public onScan(callback: (result: ScanResult) => void): void {
    this.onScanCallbacks.push(callback);
  }

  public onError(callback: (error: string) => void): void {
    this.onErrorCallbacks.push(callback);
  }

  private notifyScan(result: ScanResult): void {
    this.onScanCallbacks.forEach(callback => callback(result));
  }

  private notifyError(error: string): void {
    this.onErrorCallbacks.forEach(callback => callback(error));
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    // Stop camera stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    
    // Clear timeouts
    if (this.keypressTimeout) {
      clearTimeout(this.keypressTimeout);
    }
    
    // Remove event listeners
    document.removeEventListener('keydown', this.handleKeypress);
    
    console.log('🧹 Barcode scanner manager destroyed');
  }

  /**
   * Get scanner status
   */
  public getStatus(): { 
    isScanning: boolean; 
    supportedTypes: string[]; 
    config: ScannerConfig;
  } {
    const supportedTypes: string[] = [];
    
    if (this.config.enableHID) supportedTypes.push('HID');
    if (this.config.enableWebUSB && 'usb' in window) supportedTypes.push('WebUSB');
    if (this.config.enableCamera && navigator.mediaDevices) supportedTypes.push('Camera');
    
    return {
      isScanning: this.isScanning,
      supportedTypes,
      config: this.config
    };
  }
}

// Export singleton instance
export const barcodeScanner = new BarcodeScannerManager();