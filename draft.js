import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  FlatList,
  Modal,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Buffer } from 'buffer';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

// Optimize image processing
import * as ImageManipulator from 'expo-image-manipulator';
import { StatusBar } from 'expo-status-bar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function App() {
  const [images, setImages] = useState([]);
  const [recentPdfs, setRecentPdfs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isRecentPdfsModalVisible, setIsRecentPdfsModalVisible] = useState(false);

  useEffect(() => {
    loadRecentPdfs();
  }, []);

  const loadRecentPdfs = async () => {
    try {
      const pdfDir = `${FileSystem.documentDirectory}recent_pdfs/`;
      await FileSystem.makeDirectoryAsync(pdfDir, { intermediates: true });
      const files = await FileSystem.readDirectoryAsync(pdfDir);
      const pdfFiles = files.filter((file) => file.endsWith('.pdf'));
      setRecentPdfs(pdfFiles.map(file => `${pdfDir}${file}`));
    } catch (error) {
      console.error('Error loading recent PDFs:', error);
    }
  };

  const optimizeImage = async (uri) => {
    try {
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1600 } }], // Resize while maintaining aspect ratio
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      return manipulatedImage.uri;
    } catch (error) {
      console.error('Image optimization error:', error);
      return uri;
    }
  };

  const selectImages = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Please grant photo library access');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
      });

      if (!result.canceled) {
        const optimizedImages = await Promise.all(
          result.assets.map(async (asset) => ({
            ...asset,
            uri: await optimizeImage(asset.uri),
          }))
        );
        setImages(optimizedImages);
      }
    } catch (error) {
      console.error('Image selection error:', error);
      Alert.alert('Error', 'Failed to select images');
    }
  };

  const createPdf = async () => {
    if (images.length === 0) {
      Alert.alert('No Images', 'Please select images first');
      return;
    }

    setIsLoading(true);
    setProgress(0);

    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        setProgress((i + 1) / images.length);

        const imgBytesBase64 = await FileSystem.readAsStringAsync(img.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const imgBytes = Buffer.from(imgBytesBase64, 'base64');

        let embeddedImage;
        if (img.uri.toLowerCase().endsWith('.jpg') || img.uri.toLowerCase().endsWith('.jpeg')) {
          embeddedImage = await pdfDoc.embedJpg(imgBytes);
        } else if (img.uri.toLowerCase().endsWith('.png')) {
          embeddedImage = await pdfDoc.embedPng(imgBytes);
        } else {
          throw new Error(`Unsupported image format: ${img.uri}`);
        }

        const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
        page.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: embeddedImage.width,
          height: embeddedImage.height,
        });

        // Watermark with improved styling
        page.drawText('Developed by @imnb57', {
          x: 10,
          y: 10,
          size: 10,
          font,
          color: rgb(0.7, 0.7, 0.7),
          opacity: 0.5,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const pdfDir = `${FileSystem.documentDirectory}recent_pdfs/`;
      await FileSystem.makeDirectoryAsync(pdfDir, { intermediates: true });

      // Determine the next file name incrementally
      const generateNextPdfName = (existingFiles) => {
        const pdfNumbers = existingFiles
          .map((file) => {
            const match = file.match(/File (\d+)\.pdf$/);
            return match ? parseInt(match[1], 10) : null;
          })
          .filter((num) => num !== null);

        const nextNumber = pdfNumbers.length > 0 ? Math.max(...pdfNumbers) + 1 : 1;
        return `File ${nextNumber}.pdf`;
      };

      const pdfFileName = generateNextPdfName(
        recentPdfs.map((file) => file.split('/').pop())
      );
      const pdfUri = `${pdfDir}${pdfFileName}`;

      await FileSystem.writeAsStringAsync(
        pdfUri,
        Buffer.from(pdfBytes).toString('base64'),
        {
          encoding: FileSystem.EncodingType.Base64,
        }
      );

      // Save to media library
      await MediaLibrary.createAssetAsync(pdfUri);

      // Update recent PDFs
      setRecentPdfs((prev) => [pdfUri, ...prev]);

      setIsLoading(false);
      Alert.alert('Success', 'PDF created and saved');
    } catch (error) {
      setIsLoading(false);
      console.error(error);
      Alert.alert('Error', `Failed to create PDF: ${error.message}`);
    }
  };

  const sharePdf = async (pdfPath) => {
    if (!pdfPath) {
      Alert.alert('No PDF', 'Please select a PDF to share');
      return;
    }

    try {
      await Sharing.shareAsync(pdfPath);
    } catch (error) {
      console.error('Sharing error:', error);
      Alert.alert('Error', 'Failed to share PDF');
    }
  };

  const renderRecentPdfItem = ({ item }) => (
    <View style={styles.recentPdfItem}>
      <Text style={styles.recentPdfText} numberOfLines={1}>
        {item.split('/').pop()}
      </Text>

      <View style={styles.recentPdfActions}>
        <TouchableOpacity onPress={() => sharePdf(item)}>
          <Ionicons name="share-outline" size={24} color="#007bff" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => deletePdf(item)}>
          <Ionicons name="trash-outline" size={24} color="#ff4d4d" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const deletePdf = async (pdfPath) => {
    try {
      await FileSystem.deleteAsync(pdfPath);
      setRecentPdfs((prev) => prev.filter((file) => file !== pdfPath));
      Alert.alert('Deleted', 'PDF has been removed');
    } catch (error) {
      console.error('Failed to delete PDF:', error);
      Alert.alert('Error', 'Could not delete the PDF');
    }
  };

  const clearAllPdfs = async () => {
    try {
      await Promise.all(
        recentPdfs.map((pdfPath) => FileSystem.deleteAsync(pdfPath))
      );
      setRecentPdfs([]); 
      Alert.alert('Success', 'All PDFs have been removed');
    } catch (error) {
      console.error('Failed to clear PDFs:', error);
      Alert.alert('Error', 'Could not clear PDFs');
    }
  };

  const RecentPdfsModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isRecentPdfsModalVisible}
      onRequestClose={() => setIsRecentPdfsModalVisible(false)}
    >
      <BlurView intensity={50} style={styles.modalBackground}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Recent PDFs</Text>

          <TouchableOpacity
            style={styles.clearAllButton}
            onPress={clearAllPdfs}
          >
            <Text style={styles.clearAllButtonText}>Clear All PDFs</Text>
          </TouchableOpacity>

          <FlatList
            data={recentPdfs}
            renderItem={renderRecentPdfItem}
            keyExtractor={(item, index) => index.toString()}
            ListEmptyComponent={
              <Text style={styles.emptyListText}>No recent PDFs</Text>
            }
          />

          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={() => setIsRecentPdfsModalVisible(false)}
          >
            <Text style={styles.modalCloseButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );

  return (
  <>
   <StatusBar barStyle="dark-content" backgroundColor="#f0f4f8" />
    <View style={styles.container}>
      <Text style={styles.title}>Image to PDF converter</Text>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>
            Converting Images... {`${Math.round(progress * 100)}%`}
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressIndicator,
                { width: `${progress * 100}%` },
              ]}
            />
          </View>
        </View>
      )}

      <TouchableOpacity
        style={styles.iconButton}
        onPress={() => setIsRecentPdfsModalVisible(true)}
      >
        <Ionicons name="document-outline" size={24} color="#007bff" />
        <Text style={styles.iconButtonText}>Your Recent PDFs</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.selectImagesButton}
        onPress={selectImages}
        disabled={isLoading}
      >
        <Ionicons name="images-outline" size={24} color="white" />
        <Text style={styles.selectImagesButtonText}>Select Images</Text>
      </TouchableOpacity>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.imagePreviewContainer}
      >
        {images.map((image, index) => (
          <Image
            key={index}
            source={{ uri: image.uri }}
            style={styles.imagePreview}
          />
        ))}
      </ScrollView>

      <View style={styles.actionButtonContainer}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            (images.length === 0 || isLoading) && styles.disabledButton,
          ]}
          onPress={createPdf}
          disabled={images.length === 0 || isLoading}
        >
          <Ionicons name="create-outline" size={24} color="white" />
          <Text style={styles.actionButtonText}>
            {isLoading ? 'Creating...' : 'Create PDF'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.clearButton}
          onPress={() => setImages([])}
          disabled={isLoading}
        >
          <Ionicons name="trash-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <RecentPdfsModal />
    </View>
  </>  
  );
}

// Styles remain the same as in the original code
const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#f0f4f8',
      paddingTop: 50,
      paddingHorizontal: 16,
    },
  
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#333',
      textAlign: 'center',
      marginBottom: 20,
    },
  
    iconButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-end',
      marginBottom: 15,
      backgroundColor: '#e6f2ff',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
    },
  
    iconButtonText: {
      marginLeft: 8,
      color: '#007bff',
      fontWeight: '600',
    },
  
    selectImagesButton: {
      flexDirection: 'row',
      backgroundColor: '#007bff',
      paddingVertical: 15,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 15,
      elevation: 3,
    },
  
    selectImagesButtonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 10,
    },
  
    imagePreviewContainer: {
      marginBottom: 15,
      maxHeight: 120,
    },
  
    imagePreview: {
      width: 100,
      height: 100,
      borderRadius: 12,
      marginRight: 10,
      borderWidth: 2,
      borderColor: '#e0e0e0',
    },
  
    actionButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
  
    actionButton: {
      flexDirection: 'row',
      flex: 1,
      backgroundColor: '#007bff',
      paddingVertical: 15,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
      elevation: 3,
    },
  
    actionButtonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 10,
    },
  
    clearButton: {
      backgroundColor: '#ff4d4d',
      padding: 15,
      borderRadius: 12,
      elevation: 3,
    },
  
    disabledButton: {
      backgroundColor: '#cccccc',
      opacity: 0.6,
    },
  
    // Loading Overlay Styles
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(255,255,255,0.9)',
      justifyContent: 'flex-end', // Align content at the top
      alignItems: 'center',
      paddingBottom: 128,
      zIndex: 1000,
    },
  
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: '#007bff',
    },
  
    progressBar: {
      width: '80%',
      height: 10,
      backgroundColor: '#e0e0e0',
      borderRadius: 5,
      marginTop: 15,
      overflow: 'hidden',
    },
  
    progressIndicator: {
      height: '100%',
      backgroundColor: '#007bff',
    },
  
    // Recent PDFs Modal Styles
    modalBackground: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  
    modalContainer: {
      width: SCREEN_WIDTH * 0.9,
      backgroundColor: 'white',
      borderRadius: 15,
      padding: 20,
      maxHeight: '70%',
    },
  
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 15,
      textAlign: 'center',
    },
  
    recentPdfItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#f0f0f0',
    },
  
    recentPdfText: {
      flex: 1,
      marginRight: 10,
    },
  
    recentPdfActions: {
      flexDirection: 'row',
    },
  
    modalCloseButton: {
      marginTop: 15,
      backgroundColor: '#007bff',
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
  
    modalCloseButtonText: {
      color: 'white',
      fontWeight: '600',
      fontSize: 16,
    },
  
    emptyListText: {
      textAlign: 'center',
      color: '#888',
      marginTop: 20,
    },
  
    clearAllButton: {
      backgroundColor: '#ffeb3d',
      padding: 10,
      borderRadius: 10,
      alignItems: 'center',
      marginVertical: 10,
    },
  
    clearAllButtonText: {
      fontWeight: 'bold',
      fontSize: 16,
      color: 'black',
    },
  
    recentPdfActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: 80,
    },
  
    deleteButton: {
      paddingHorizontal: 8,
    },
  
    // Updated Action Button Disabled Effect
    disabledActionButtonText: {
      opacity: 0.6,
    },
  
    clearButtonText: {
      fontWeight: '600',
      color: 'white',
      fontSize: 16,
    },
  });