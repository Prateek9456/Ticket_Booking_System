export default function SeatMap({ seats, rows, cols, selected, onToggle, userId }) {
  const grid = {};
  for (const seat of seats) {
    if (!grid[seat.row_num]) grid[seat.row_num] = {};
    grid[seat.row_num][seat.col_num] = seat;
  }

  function seatClass(seat) {
    if (seat.status === 'booked') return 'booked';
    if (seat.status === 'held') {
      return seat.held_by === userId ? 'held' : 'held-other';
    }
    if (selected.includes(seat.seat_id)) return 'selected available';
    return 'available';
  }

  function handleClick(seat) {
    if (seat.status === 'booked') return;
    if (seat.status === 'held' && seat.held_by !== userId) return;
    onToggle(seat.seat_id);
  }

  return (
    <div className="seat-map-container">
      <div className="screen">SCREEN / STAGE</div>
      <div className="seat-grid">
        {Array.from({ length: rows }, (_, ri) => {
          const row = ri + 1;
          return (
            <div key={row} className="seat-row">
              <span className="row-label">{row}</span>
              {Array.from({ length: cols }, (_, ci) => {
                const col = ci + 1;
                const seat = grid[row]?.[col];
                if (!seat) return <div key={col} style={{ width: 32 }} />;
                return (
                  <button
                    key={seat.seat_id}
                    className={`seat ${seatClass(seat)}`}
                    style={{ background: seat.status === 'booked' || seat.status === 'held' ? undefined : seat.color }}
                    onClick={() => handleClick(seat)}
                    title={`Row ${seat.row_num} Col ${seat.col_num} - ${seat.category_name} ($${seat.price})`}
                    disabled={seat.status === 'booked' || (seat.status === 'held' && seat.held_by !== userId)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
