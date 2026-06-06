/**
 * Journal Components Module (Web Version)
 * 
 * Export all journal-related components.
 * This web-specific index ensures components resolve correctly for web.
 */

// Entry display
export { JournalEntryCard } from './JournalEntryCard';
export { default as JournalEntryCardComponent } from './JournalEntryCard';

// Media gallery tab
export { MediaGalleryTab, MediaFilter } from './MediaGalleryTab';
export { default as MediaGalleryTabComponent } from './MediaGalleryTab';

// Floating action button
export { 
  FloatingActionButton, 
  SimpleFAB, 
  CameraFAB,
  FABAction,
} from './FloatingActionButton';
export { default as FloatingActionButtonComponent } from './FloatingActionButton';

// Compose modal
export { JournalComposeModal } from './JournalComposeModal';
export { default as JournalComposeModalComponent } from './JournalComposeModal';

// Calendar coils header
export { CalendarCoils } from './CalendarCoils';
export { default as CalendarCoilsComponent } from './CalendarCoils';

// Date swipe container
export { DateSwipeContainer } from './DateSwipeContainer';
export { default as DateSwipeContainerComponent } from './DateSwipeContainer';

// Quick capture bar
export { QuickCaptureBar } from './QuickCaptureBar';
export { default as QuickCaptureBarComponent } from './QuickCaptureBar';

// Entry gallery modal (per-entry map + media) - web version without react-native-maps
export { EntryGalleryModal } from './EntryGalleryModal.web';
export { default as EntryGalleryModalComponent } from './EntryGalleryModal.web';

// Full screen media viewer
export { FullScreenMediaViewer } from './FullScreenMediaViewer';
export { default as FullScreenMediaViewerComponent } from './FullScreenMediaViewer';

// Calendar picker modal
export { CalendarPickerModal } from './CalendarPickerModal';
export { default as CalendarPickerModalComponent } from './CalendarPickerModal';
