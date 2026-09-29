-- Research PDFs move from Google Drive to the private Blob store.
-- New writes go to pdfBlobPath. driveFileId stays for read-only fallback on old rows.
ALTER TABLE "Reference" ADD COLUMN "pdfBlobPath" TEXT;
