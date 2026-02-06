// import { Link, useParams } from "react-router-dom";

// const notices = {
//   "1": { title: "Admission Open 2026", date: "05 Feb 2026", body: "Admission is now open for 2026. Please contact for details." },
//   "2": { title: "Monthly Exam Routine", date: "03 Feb 2026", body: "Exam routine has been published. Please check your class schedule." },
//   "3": { title: "Parents Meeting Schedule", date: "01 Feb 2026", body: "Parents meeting will be held on Friday at 3:00 PM." },
//   "4": { title: "Fee Due Reminder", date: "28 Jan 2026", body: "Please pay due fees by 10th to avoid late fee." },
// };

// export default function NoticeDetails() {
//   const { id } = useParams();
//   const n = notices[id];

//   if (!n) return <div style={{ padding: 16 }}>Notice not found</div>;

//   return (
//     <div style={{ maxWidth: 900, margin: "30px auto", padding: 16, fontFamily: "Poppins, sans-serif" }}>
//       <Link to="/notices">← Back</Link>
//       <h2 style={{ marginTop: 12 }}>{n.title}</h2>
//       <div style={{ color: "#666" }}>{n.date}</div>
//       <p style={{ marginTop: 12, lineHeight: 1.7 }}>{n.body}</p>
//     </div>
//   );
// }
import { Link, useParams } from "react-router-dom";
import "../styles/notice.css";

const notices = {
  "1": { title: "Admission Open 2026", date: "05 Feb 2026", body: "Admission is now open for 2026. Please contact for details." },
  "2": { title: "Monthly Exam Routine", date: "03 Feb 2026", body: "Exam routine has been published. Please check your class schedule." },
  "3": { title: "Parents Meeting Schedule", date: "01 Feb 2026", body: "Parents meeting will be held on Friday at 3:00 PM." },
  "4": { title: "Fee Due Reminder", date: "28 Jan 2026", body: "Please pay due fees by 10th to avoid late fee." },
};

export default function NoticeDetails() {
  const { id } = useParams();
  const n = notices[id];

  if (!n) return <div className="noticeWrap">Notice not found</div>;

  return (
    <div className="noticeWrap">
      <div className="noticeCard">
        <Link to="/notices" className="noticeBack">← Back to Notices</Link>
        <h2 className="noticeTitle">{n.title}</h2>
        <div className="noticeMeta">{n.date}</div>
        <div className="noticeBody">{n.body}</div>
      </div>
    </div>
  );
}
