import nodemailer from "nodemailer";

export const sendContactMessage = async (req, res) => {
  try {
    const { schoolName, name, phone, email, message } = req.body;

    if (!schoolName || !phone || !message) {
      return res.status(400).json({ message: "School name, phone and message required" });
    }

    // ✅ ENV check (Render env না থাকলে এখানেই ধরবে)
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !process.env.CONTACT_TO) {
      return res.status(500).json({ message: "Mail config missing in server env" });
    }

    const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
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
        <p><b>School:</b> ${schoolName}</p>
        <p><b>Name:</b> ${name || "-"}</p>
        <p><b>Phone:</b> ${phone}</p>
        <p><b>Email:</b> ${email || "-"}</p>
        <p><b>Message:</b><br/>${message}</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({ message: "Message sent successfully" });
  } catch (error) {
    console.error("MAIL ERROR:", error); // ✅ log
    return res.status(500).json({
      message: error?.message || "Mail send failed",
      code: error?.code,
    });
  }
};
