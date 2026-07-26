import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { listNotices } from "../api/notices";
import "../styles/notice.css";

export default function NoticeList() {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchNotices = async () => {
      setLoading(true);
      try {
        const res = await listNotices();
        setNotices(res?.notices || []);
      } catch (err) {
          console.error("Failed to load notices:", err);
          setError(err?.response?.data?.message || err.message);
        } finally {
          setLoading(false);
        }
      };
    fetchNotices();
  }, []);

  if (loading) {
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
        <div className="noticeItem">
          <div className="noticeTagRow">
            <span className="noticeTag">Notice</span>
            <span className="noticeDate">Loading...</span>
          </div>
          <div className="noticeItemTitle">Loading notices...</div>
        </div>
      </div>
      </div>
    );
  }

  if (error) {
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
        <div className="noticeItem">
          <div className="noticeTagRow">
            <span className="noticeTag">Notice</span>
            <span className="noticeDate">Error</span>
          </div>
          <div className="noticeItemTitle">Failed to load notices</div>
          <div className="noticeItemBody">{error}</div>
        </div>
      </div>
      </div>
    );
  }

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
        {notices.length === 0 ? (
          <div className="noticeItem">
            <div className="noticeTagRow">
              <span className="noticeTag">Notice</span>
              <span className="noticeDate">-</span>
            </div>
            <div className="noticeItemTitle">No notices yet</div>
            <div className="noticeItemBody">Check back later for updates.</div>
          </div>
        ) : (
          notices.map((n) => (
            <div key={n._id} className="noticeItem">
              <div className="noticeTagRow">
                <span className="noticeTag">{n.tag || "Notice"}</span>
                <span className="noticeDate">{new Date(n.publishDate || n.createdAt).toLocaleDateString()}</span>
              </div>

              <div className="noticeItemTitle">{n.title}</div>
              <div className="noticeItemBody">{n.body}</div>

              <div className="noticeActions">
                <Link className="noticeRead" to={`/notices/${n._id}`}>
                  Read details →
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
