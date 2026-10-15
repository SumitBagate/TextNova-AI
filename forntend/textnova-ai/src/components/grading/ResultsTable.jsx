import React from "react";
import "./ResultsTable.css";

const ResultsTable = ({ results, loading }) => {
  if (!results || results.length === 0) {
    return null;
  }

  return (
    <div className="results-table-container">
      <h3>📊 Grading Results</h3>
      <div className="table-wrapper">
        <table className="results-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Student Name</th>
              <th>Roll Number</th>
              <th>Question 1</th>
              <th>Question 2</th>
              <th>Question 3</th>
              <th>Total Marks</th>
              <th>Percentage</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, index) => (
              <tr key={index} className={`status-${result.status}`}>
                <td>{result.subject || "General"}</td>
                <td className="student-name">{result.studentName}</td>
                <td>{result.rollNumber}</td>
                <td className="marks">{result.q1 || "-"}</td>
                <td className="marks">{result.q2 || "-"}</td>
                <td className="marks">{result.q3 || "-"}</td>
                <td className="total-marks">{result.totalMarks}</td>
                <td className="percentage">
                  <span className="badge">{result.percentage}%</span>
                </td>
                <td>
                  <span className={`status-badge status-${result.status}`}>
                    {result.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResultsTable;
