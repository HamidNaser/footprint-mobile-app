/**
 * Media Components Module
 * 
 * Export all media capture and playback components.
 */

// Audio components
export { 
  AudioRecorder, 
  RecordingQuality, 
  RecordingState 
} from './AudioRecorder';

export { 
  AudioPlayer, 
  PlaybackState 
} from './AudioPlayer';

// Camera and capture
export { 
  CameraCapture, 
  CameraMode, 
  FlashMode 
} from './CameraCapture';

// Media picker
export { 
  MediaPicker, 
  MediaPickerType,
  pickMedia,
  takePhoto,
  recordVideo,
} from './MediaPicker';

// Video thumbnails
export { 
  VideoThumbnail, 
  VideoThumbnailGridItem,
  generateThumbnail,
  generateThumbnailStrip,
  clearThumbnailCache,
} from './VideoThumbnail';

// Media preview
export { 
  MediaPreview, 
  MediaPreviewCarousel,
  PreviewMediaType,
} from './MediaPreview';

// Default exports for convenience
export { default as AudioRecorderComponent } from './AudioRecorder';
export { default as AudioPlayerComponent } from './AudioPlayer';
export { default as CameraCaptureComponent } from './CameraCapture';
export { default as MediaPickerComponent } from './MediaPicker';
export { default as VideoThumbnailComponent } from './VideoThumbnail';
export { default as MediaPreviewComponent } from './MediaPreview';
