import ImageCollectionManager from "../../components/admin/ImageCollectionManager";

export default function GalleryManager() {
  return (
    <ImageCollectionManager
      kind="gallery"
      title="Gallery Images"
      description="Campus, events and activities shown in the home page gallery. The cover image is shown first."
    />
  );
}
