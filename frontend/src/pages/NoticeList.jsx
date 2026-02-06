import { Link } from "react-router-dom";
import "../styles/notice.css";

const notices = [
  { id: "1", title: "Admission Open 2026", date: "05 Feb 2026", body: "Admission is now open..." },
  { id: "2", title: "Monthly Exam Routine", date: "03 Feb 2026", body: "Exam routine published..." },
  { id: "3", title: "Parents Meeting Schedule", date: "01 Feb 2026", body: "Parents meeting at..." },
  { id: "4", title: "Fee Due Reminder", date: "28 Jan 2026", body: "Please pay fees..." },
];

export default function NoticeList() {
  return (
    <div className="noticeWrap">
      <div className="noticeHeader">
        <div>
          <h2 className="noticePageTitle">Notices</h2>
          <p className="noticePageSub">Latest updates, routines, and important announcements.</p>
        </div>

        <Link to="/" className="noticeBtn">
          ← Back to Home
        </Link>
      </div>

      <div className="noticeGrid">
        {notices.map((n) => (
          <div key={n.id} className="noticeItem">
            <div className="noticeTagRow">
              <span className="noticeTag">Notice</span>
              <span className="noticeDate">{n.date}</span>
            </div>

            <div className="noticeItemTitle">{n.title}</div>
            <div className="noticeItemBody">{n.body}</div>

            <div className="noticeActions">
              <Link className="noticeRead" to={`/notices/${n.id}`}>
                Read details →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
