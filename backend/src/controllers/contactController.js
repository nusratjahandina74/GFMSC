// import nodemailer from "nodemailer";

// export const sendContactMessage = async (req, res) => {
//   try {
//     const { schoolName, name, phone, email, message } = req.body;

//     if (!schoolName || !phone) {
//       return res.status(400).json({ message: "School name and phone required" });
//     }

//     const transporter = nodemailer.createTransport({
//       service: "gmail",
//       auth: {
//         user: process.env.GMAIL_USER,
//         pass: process.env.GMAIL_APP_PASSWORD,
//       },
//     });

//     const mailOptions = {
//       from: `"GFMSC Contact" <${process.env.GMAIL_USER}>`,
//       to: process.env.CONTACT_TO,
//       subject: "New School Demo Request",
//       html: `
//         <h3>New Contact Request</h3>
//         <p><b>School Name:</b> ${schoolName}</p>
//         <p><b>Phone:</b> ${phone}</p>
//         <p><b>Total Students:</b> ${totalStudents}</p>
//         <p><b>Email:</b> ${email}</p>
//         <p><b>Message:</b> ${message}</p>
//       `,
//     };

//     await transporter.sendMail(mailOptions);

//     res.status(200).json({ message: "Message sent successfully" });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };
import nodemailer from "nodemailer";

export const sendContactMessage = async (req, res) => {
  try {
    const { schoolName, name, phone, email, message } = req.body;

    if (!schoolName || !phone) {
      return res.status(400).json({ message: "School name and phone required" });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const mailOptions = {
      from: `"GFMSC Contact" <${process.env.GMAIL_USER}>`,
      to: process.env.CONTACT_TO,
      subject: "New Contact Message",
      html: `
        <h3>New Contact Request</h3>
        <p><b>School Name:</b> ${schoolName}</p>
        <p><b>Name:</b> ${name}</p>
        <p><b>Phone:</b> ${phone}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Message:</b> ${message}</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "Message sent successfully" });
  }  catch (error) {
  console.error("MAIL ERROR:", error);
  res.status(500).json({ message: error.message });
}
};
