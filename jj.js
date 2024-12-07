import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  FlatList,
  Dimensions,
  Platform,
  SafeAreaView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { PDFDocument } from 'pdf-lib';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ImageManipulator from 'expo-image-manipulator';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function PDFConverter() {
  // State Management
  const [selectedImages, setSelectedImages] = useState([]);
  const [availableImages, setAvailableImages] = useState([]);
  const [isSelectModalVisible, setIsSelectModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [albums, setAlbums] = useState([]);

  // Image Selection Methods
  const loadAlbums = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library access');
        return;
      }

      const loadedAlbums = await MediaLibrary.getAlbumsAsync({
        includeSmartAlbums: true,
      });

      // Filter and prioritize albums
      const filteredAlbums = loadedAlbums
        .filter(album => album.assetCount > 0)
        .sort((a, b) => {
          const priorityAlbums = ['Camera', 'Camera Roll', 'DCIM'];
          const aPriority = priorityAlbums.includes(a.title) ? -1 : 0;
          const bPriority = priorityAlbums.includes(b.title) ? -1 : 0;
          return bPriority - aPriority;
        });

      setAlbums(filteredAlbums);
      
      // Automatically select first album
      if (filteredAlbums.length > 0) {
        loadAlbumImages(filteredAlbums[0]);
      }
    } catch (error) {
      console.error('Failed to load albums', error);
      Alert.alert('Error', 'Could not load photo albums');
    }
  };

  const loadAlbumImages = async (album) => {
    try {
      const mediaResult = await MediaLibrary.getAssetsAsync({
        first: 500,
        album: album,
        mediaType: ['photo'],
        sortBy: ['creationTime'],
      });

      setAvailableImages(mediaResult.assets);
      setSelectedAlbum(album);
    } catch (error) {
      console.error('Failed to load album images', error);
    }
  };

  const toggleImageSelection = (asset) => {
    setSelectedImages(prev => {
      // Limit to 20 images
      if (!prev.includes(asset)) {
        if (prev.length >= 20) {
          Alert.alert('Limit Reached', 'You can select up to 20 images');
          return prev;
        }
        return [...prev, asset];
      } else {
        return prev.filter(item => item !== asset);
      }
    });
  };

  const optimizeImage = async (uri) => {
    try {
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.8, format: ImageManiper.SaveFormat.JPEG }
      );
      return manipulatedImage.uri;
    } catch (error) {
      console.error('Image optimization error:', error);
      return uri;
    }
  };

  const confirmImageSelection = async () => {
    if (selectedImages.length === 0) {
      Alert.alert('No Images', 'Please select at least one image');
      return;
    }

    // Optimize selected images
    const optimizedImages = await Promise.all(
      selectedImages.map(async (asset) => ({
        uri: await optimizeImage(asset.uri),
        fileName: asset.filename
      }))
    );

    setSelectedImages(optimizedImages);
    setIsSelectModalVisible(false);
  };

  const createPdf = async () => {
    if (selectedImages.length === 0) {
      Alert.alert(
        'No Images', 
        'Would you like to select images?',
        [
          { 
            text: 'Select Images', 
            onPress: () => setIsSelectModalVisible(true)
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }

    setIsLoading(true);
    try {
      const pdfDoc = await PDFDocument.create();
      
      for (const [index, img] of selectedImages.entries()) {
        // PDF creation logic remains similar to previous implementation
        // Add progress tracking, error handling, etc.
      }

      // Show PDF preview/confirmation modal before saving
      showPdfPreviewModal(pdfDoc);
    } catch (error) {
      console.error('PDF creation error:', error);
      Alert.alert('Error', 'Failed to create PDF');
    } finally {
      setIsLoading(false);
    }
  };

  // PDF Preview and Confirmation Modal
  const showPdfPreviewModal = (pdfDoc) => {
    Alert.alert(
      'PDF Preview',
      `You are about to create a PDF with ${selectedImages.length} images`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Save PDF',
          onPress: () => savePdfToDevice(pdfDoc),
        }
      ]
    );
  };

  // Image Selection Modal
  const ImageSelectionModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isSelectModalVisible}
      onRequestClose={() => setIsSelectModalVisible(false)}
    >
      <SafeAreaView style={styles.modalContainer}>
        {/* Album Selection */}
        <ScrollView 
          horizontal 
          style={styles.albumScrollView}
          showsHorizontalScrollIndicator={false}
        >
          {albums.map((album) => (
            <TouchableOpacity
              key={album.id}
              style={[
                styles.albumButton,
                selectedAlbum?.id === album.id && styles.selectedAlbumButton
              ]}
              onPress={() => loadAlbumImages(album)}
            >
              <Text style={styles.albumButtonText}>{album.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Image Grid */}
        <FlatList
          data={availableImages}
          numColumns={4}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.imageGridItem}
              onPress={() => toggleImageSelection(item)}
            >
              <Image 
                source={{ uri: item.uri }} 
                style={styles.gridImage} 
              />
              {selectedImages.includes(item) && (
                <View style={styles.selectedOverlay}>
                  <Ionicons name="checkmark-circle" size={24} color="white" />
                </View>
              )}
            </TouchableOpacity>
          )}
        />

        {/* Selection Summary and Confirm Button */}
        <View style={styles.selectionSummary}>
          <Text style={styles.selectionText}>
            Selected: {selectedImages.length}/20 Images
          </Text>
          <TouchableOpacity 
            style={styles.confirmSelectionButton}
            onPress={confirmImageSelection}
          >
            <Text style={styles.confirmSelectionButtonText}>
              Confirm Selection
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );

  // Initial Load
  useEffect(() => {
    loadAlbums();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PDF Converter</Text>
      
      {/* Selected Images Preview */}
      <ScrollView 
        horizontal 
        style={styles.selectedImagesPreview}
        showsHorizontalScrollIndicator={false}
      >
        {selectedImages.map((image, index) => (
          <View key={index} style={styles.previewImageContainer}>
            <Image 
              source={{ uri: image.uri }} 
              style={styles.previewImage} 
            />
            <TouchableOpacity 
              style={styles.removeImageButton}
              onPress={() => {
                const updatedImages = [...selectedImages];
                updatedImages.splice(index, 1);
                setSelectedImages(updatedImages);
              }}
            >
              <Ionicons name="close-circle" size={20} color="red" />
            </TouchableOpacity>
          </View>
        ))}

        {/* Add More Images Button */}
        <TouchableOpacity 
          style={styles.addMoreImagesButton}
          onPress={() => setIsSelectModalVisible(true)}
        >
          <Ionicons name="add-circle" size={50} color="#007bff" />
        </TouchableOpacity>
      </ScrollView>

      {/* Create PDF Button */}
      <TouchableOpacity 
        style={[
          styles.createPdfButton,
          selectedImages.length === 0 && styles.disabledButton
        ]}
        onPress={createPdf}
        disabled={selectedImages.length === 0}
      >
        <Text style={styles.createPdfButtonText}>
          Create PDF ({selectedImages.length} Images)
        </Text>
      </TouchableOpacity>

      <ImageSelectionModal />
    </View>
  );
}

// Styles would be comprehensive, incorporating the design elements
const styles = StyleSheet.create({
  // Comprehensive styles for all components
  container: {
    flex: 1,
    backgroundColor: '#f4f4f8',
    paddingTop: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  // Add more comprehensive styles for modal, buttons, image grid, etc.
  modalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  albumScrollView: {
    maxHeight: 50,
    marginBottom: 10,
  },
  albumButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginHorizontal: 5,
    backgroundColor: '#e0e0e0',
    borderRadius: 20,
  },
  selectedAlbumButton: {
    backgroundColor: '#007bff',
  },
  albumButtonText: {
    color: 'black',
  },
  imageGridItem: {
    width: SCREEN_WIDTH / 4,
    height: SCREEN_WIDTH / 4,
    padding: 2,
  },
  gridImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,123,255,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // More styles...
});

