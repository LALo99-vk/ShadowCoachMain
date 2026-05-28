import fs from "fs";
import multer from "multer";

const UPLOAD_DIR = "./uploads";
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename : function (req,file , cb) {
        cb(null , Date.now() + "-" + file.originalname)
    }
})

const upload = multer({ storage });

export default upload;