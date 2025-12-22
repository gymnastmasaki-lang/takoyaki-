import React, { useState, useEffect } from 'react';
import { Clock, Users, Plus, Edit2, Save, X, Calendar, Download, FileText, Printer } from 'lucide-react';

const AttendanceSystem = () => {
  const [employees, setEmployees] = useState([]);
  const [currentView, setCurrentView] = useState('clock'); // 'clock' or 'admin'
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [attendanceData, setAttendanceData] = useState({});
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [editingTime, setEditingTime] = useState(null);
  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [selectedPayslipEmployee, setSelectedPayslipEmployee] = useState(null);

  // Load data from localStorage
  useEffect(() => {
    const savedEmployees = localStorage.getItem('employees');
    const savedAttendance = localStorage.getItem('attendanceData');
    if (savedEmployees) setEmployees(JSON.parse(savedEmployees));
    if (savedAttendance) setAttendanceData(JSON.parse(savedAttendance));
  }, []);

  // Save data to localStorage
  useEffect(() => {
    localStorage.setItem('employees', JSON.stringify(employees));
  }, [employees]);

  useEffect(() => {
    localStorage.setItem('attendanceData', JSON.stringify(attendanceData));
  }, [attendanceData]);

  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const recordTime = (type, isHoliday = false) => {
    if (!selectedEmployee) return;
    
    const now = new Date();
    const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const newAttendance = { ...attendanceData };
    if (!newAttendance[selectedEmployee.id]) {
      newAttendance[selectedEmployee.id] = {};
    }
    if (!newAttendance[selectedEmployee.id][dateKey]) {
      newAttendance[selectedEmployee.id][dateKey] = {
        clockIn: null,
        breakStart1: null,
        breakEnd1: null,
        breakStart2: null,
        breakEnd2: null,
        clockOut: null,
        isHoliday: false,
        editHistory: []
      };
    }
    
    const record = newAttendance[selectedEmployee.id][dateKey];
    
    if (type === 'clockIn' || type === 'holidayClockIn') {
      record.clockIn = timeString;
      record.isHoliday = type === 'holidayClockIn';
    } else {
      record[type] = timeString;
    }
    
    setAttendanceData(newAttendance);
  };

  const editTime = (employeeId, dateKey, field, newValue) => {
    const newAttendance = { ...attendanceData };
    if (!newAttendance[employeeId]?.[dateKey]) return;
    
    const record = newAttendance[employeeId][dateKey];
    const oldValue = record[field];
    record[field] = newValue;
    
    // Record edit history
    const editTimestamp = new Date().toLocaleString('ja-JP');
    record.editHistory = record.editHistory || [];
    record.editHistory.push({
      field,
      oldValue,
      newValue,
      timestamp: editTimestamp
    });
    
    setAttendanceData(newAttendance);
    setEditingTime(null);
  };

  const calculateWorkHours = (record) => {
    if (!record || !record.clockIn || !record.clockOut) return 0;
    
    const parseTime = (timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };
    
    const clockInMin = parseTime(record.clockIn);
    const clockOutMin = parseTime(record.clockOut);
    let workMin = clockOutMin - clockInMin;
    
    // Subtract break times
    if (record.breakStart1 && record.breakEnd1) {
      workMin -= (parseTime(record.breakEnd1) - parseTime(record.breakStart1));
    }
    if (record.breakStart2 && record.breakEnd2) {
      workMin -= (parseTime(record.breakEnd2) - parseTime(record.breakStart2));
    }
    
    return workMin / 60; // Return hours
  };

  const calculateDailyPay = (employee, record) => {
    const workHours = calculateWorkHours(record);
    if (workHours === 0) return { base: 0, overtime: 0, holiday: 0, total: 0 };
    
    const hourlyRate = employee.hourlyRate || 0;
    let basePay = 0;
    let overtimePay = 0;
    let holidayPay = 0;
    
    if (record.isHoliday) {
      // Holiday work: 35% premium on all hours
      holidayPay = workHours * hourlyRate * 1.35;
    } else {
      if (workHours <= 8) {
        basePay = workHours * hourlyRate;
      } else {
        basePay = 8 * hourlyRate;
        overtimePay = (workHours - 8) * hourlyRate * 1.25;
      }
    }
    
    const total = basePay + overtimePay + holidayPay;
    return { base: basePay, overtime: overtimePay, holiday: holidayPay, total };
  };

  const calculateMonthlyTotals = (employeeId) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return { hours: 0, basePay: 0, overtimePay: 0, holidayPay: 0, transport: 0, total: 0 };
    
    let totalHours = 0;
    let totalBasePay = 0;
    let totalOvertimePay = 0;
    let totalHolidayPay = 0;
    
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const record = attendanceData[employeeId]?.[dateKey];
      
      if (record) {
        totalHours += calculateWorkHours(record);
        const dailyPay = calculateDailyPay(employee, record);
        totalBasePay += dailyPay.base;
        totalOvertimePay += dailyPay.overtime;
        totalHolidayPay += dailyPay.holiday;
      }
    }
    
    const transport = employee.transportAllowance || 0;
    const total = totalBasePay + totalOvertimePay + totalHolidayPay + transport;
    
    return {
      hours: totalHours,
      basePay: totalBasePay,
      overtimePay: totalOvertimePay,
      holidayPay: totalHolidayPay,
      transport,
      total
    };
  };

  const addEmployee = (name, hourlyRate, transportAllowance) => {
    const newEmployee = {
      id: Date.now().toString(),
      name,
      hourlyRate: parseFloat(hourlyRate) || 0,
      transportAllowance: parseFloat(transportAllowance) || 0
    };
    setEmployees([...employees, newEmployee]);
    setShowAddEmployee(false);
  };

  const updateEmployee = (id, name, hourlyRate, transportAllowance) => {
    setEmployees(employees.map(emp => 
      emp.id === id 
        ? { ...emp, name, hourlyRate: parseFloat(hourlyRate) || 0, transportAllowance: parseFloat(transportAllowance) || 0 }
        : emp
    ));
    setEditingEmployee(null);
  };

  const deleteEmployee = (id) => {
    if (confirm('この従業員を削除してもよろしいですか？')) {
      setEmployees(employees.filter(emp => emp.id !== id));
      const newAttendance = { ...attendanceData };
      delete newAttendance[id];
      setAttendanceData(newAttendance);
    }
  };

  // Export to CSV
  const exportToCSV = (employeeId) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return;

    const totals = calculateMonthlyTotals(employeeId);
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    
    let csvContent = '\uFEFF'; // BOM for UTF-8
    csvContent += `給与明細書\n`;
    csvContent += `${currentYear}年${currentMonth + 1}月分\n\n`;
    csvContent += `氏名,${employee.name}\n`;
    csvContent += `時給,¥${employee.hourlyRate.toLocaleString()}\n`;
    csvContent += `交通費,¥${employee.transportAllowance.toLocaleString()}\n\n`;
    
    csvContent += `日付,出勤,休憩入1,休憩出1,休憩入2,休憩出2,退勤,労働時間,日給,備考\n`;
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const record = attendanceData[employeeId]?.[dateKey];
      
      if (record && record.clockIn) {
        const workHours = calculateWorkHours(record);
        const dailyPay = calculateDailyPay(employee, record);
        const remarks = record.isHoliday ? '休日出勤' : '';
        
        csvContent += `${day}日,`;
        csvContent += `${record.clockIn || ''},`;
        csvContent += `${record.breakStart1 || ''},`;
        csvContent += `${record.breakEnd1 || ''},`;
        csvContent += `${record.breakStart2 || ''},`;
        csvContent += `${record.breakEnd2 || ''},`;
        csvContent += `${record.clockOut || ''},`;
        csvContent += `${workHours.toFixed(1)}h,`;
        csvContent += `¥${Math.round(dailyPay.total).toLocaleString()},`;
        csvContent += `${remarks}\n`;
      }
    }
    
    csvContent += `\n給与内訳\n`;
    csvContent += `項目,金額\n`;
    csvContent += `基本給,¥${Math.round(totals.basePay).toLocaleString()}\n`;
    csvContent += `時間外手当（25%）,¥${Math.round(totals.overtimePay).toLocaleString()}\n`;
    csvContent += `休日出勤手当（35%）,¥${Math.round(totals.holidayPay).toLocaleString()}\n`;
    csvContent += `交通費,¥${totals.transport.toLocaleString()}\n`;
    csvContent += `合計労働時間,${totals.hours.toFixed(1)}時間\n`;
    csvContent += `総支給額,¥${Math.round(totals.total).toLocaleString()}\n`;
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `給与明細_${employee.name}_${currentYear}年${currentMonth + 1}月.csv`;
    link.click();
  };

  // Export all attendance data to CSV (for Google Sheets import)
  const exportAllToCSV = () => {
    let csvContent = '\uFEFF'; // BOM for UTF-8
    csvContent += `年,月,日,従業員ID,氏名,時給,交通費,出勤,休憩入1,休憩出1,休憩入2,休憩出2,退勤,休日出勤,労働時間,基本給,時間外手当,休日出勤手当,日給合計\n`;
    
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    
    employees.forEach(emp => {
      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const record = attendanceData[emp.id]?.[dateKey];
        
        if (record && record.clockIn) {
          const workHours = calculateWorkHours(record);
          const dailyPay = calculateDailyPay(emp, record);
          
          csvContent += `${currentYear},`;
          csvContent += `${currentMonth + 1},`;
          csvContent += `${day},`;
          csvContent += `${emp.id},`;
          csvContent += `${emp.name},`;
          csvContent += `${emp.hourlyRate},`;
          csvContent += `${emp.transportAllowance},`;
          csvContent += `${record.clockIn || ''},`;
          csvContent += `${record.breakStart1 || ''},`;
          csvContent += `${record.breakEnd1 || ''},`;
          csvContent += `${record.breakStart2 || ''},`;
          csvContent += `${record.breakEnd2 || ''},`;
          csvContent += `${record.clockOut || ''},`;
          csvContent += `${record.isHoliday ? 'はい' : 'いいえ'},`;
          csvContent += `${workHours.toFixed(2)},`;
          csvContent += `${Math.round(dailyPay.base)},`;
          csvContent += `${Math.round(dailyPay.overtime)},`;
          csvContent += `${Math.round(dailyPay.holiday)},`;
          csvContent += `${Math.round(dailyPay.total)}\n`;
        }
      }
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `勤怠データ_${currentYear}年${currentMonth + 1}月.csv`;
    link.click();
  };

  // Clock-in view
  const ClockView = () => (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Clock className="w-6 h-6" />
          打刻システム
        </h2>
        
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">従業員を選択</label>
          <select
            className="w-full p-3 border rounded-lg"
            value={selectedEmployee?.id || ''}
            onChange={(e) => setSelectedEmployee(employees.find(emp => emp.id === e.target.value))}
          >
            <option value="">選択してください</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>

        {selectedEmployee && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => recordTime('clockIn')}
                className="p-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium"
              >
                出勤
              </button>
              <button
                onClick={() => recordTime('holidayClockIn', true)}
                className="p-4 bg-purple-500 text-white rounded-lg hover:bg-purple-600 font-medium"
              >
                休日出勤
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => recordTime('breakStart1')}
                className="p-4 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-medium"
              >
                休憩入1
              </button>
              <button
                onClick={() => recordTime('breakEnd1')}
                className="p-4 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium"
              >
                休憩出1
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => recordTime('breakStart2')}
                className="p-4 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-medium"
              >
                休憩入2
              </button>
              <button
                onClick={() => recordTime('breakEnd2')}
                className="p-4 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium"
              >
                休憩出2
              </button>
            </div>
            
            <button
              onClick={() => recordTime('clockOut')}
              className="w-full p-4 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium"
            >
              退勤
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Admin view
  const AdminView = () => {
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    
    return (
      <div className="p-6">
        <div className="mb-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6" />
            管理画面
          </h2>
          <div className="flex gap-3 items-center">
            <button
              onClick={exportAllToCSV}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              全データCSV出力
            </button>
            <select
              value={currentMonth}
              onChange={(e) => setCurrentMonth(Number(e.target.value))}
              className="p-2 border rounded"
            >
              {[...Array(12)].map((_, i) => (
                <option key={i} value={i}>{i + 1}月</option>
              ))}
            </select>
            <select
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
              className="p-2 border rounded"
            >
              {[2024, 2025, 2026].map(year => (
                <option key={year} value={year}>{year}年</option>
              ))}
            </select>
            <button
              onClick={() => setShowAddEmployee(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              従業員追加
            </button>
          </div>
        </div>

        {/* Employee Management */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h3 className="font-bold mb-3">従業員一覧</h3>
          <div className="space-y-2">
            {employees.map(emp => (
              <div key={emp.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                {editingEmployee === emp.id ? (
                  <EmployeeForm
                    employee={emp}
                    onSave={(name, rate, transport) => updateEmployee(emp.id, name, rate, transport)}
                    onCancel={() => setEditingEmployee(null)}
                  />
                ) : (
                  <>
                    <div>
                      <span className="font-medium">{emp.name}</span>
                      <span className="text-sm text-gray-600 ml-4">
                        時給: ¥{emp.hourlyRate.toLocaleString()} / 交通費: ¥{emp.transportAllowance.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingEmployee(emp.id)}
                        className="p-2 text-blue-500 hover:bg-blue-50 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteEmployee(emp.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Attendance Table */}
        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="p-2 border text-left sticky left-0 bg-gray-100 z-10">日付</th>
                {employees.map(emp => (
                  <th key={emp.id} className="p-2 border text-center" colSpan="8">
                    {emp.name}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="p-2 border sticky left-0 bg-gray-100 z-10"></th>
                {employees.map(emp => (
                  <React.Fragment key={emp.id}>
                    <th className="p-1 border text-xs">出勤</th>
                    <th className="p-1 border text-xs">休1入</th>
                    <th className="p-1 border text-xs">休1出</th>
                    <th className="p-1 border text-xs">休2入</th>
                    <th className="p-1 border text-xs">休2出</th>
                    <th className="p-1 border text-xs">退勤</th>
                    <th className="p-1 border text-xs">時間</th>
                    <th className="p-1 border text-xs">給与</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(daysInMonth)].map((_, dayIndex) => {
                const day = dayIndex + 1;
                const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                
                return (
                  <tr key={day} className="hover:bg-gray-50">
                    <td className="p-2 border font-medium sticky left-0 bg-white">{day}日</td>
                    {employees.map(emp => {
                      const record = attendanceData[emp.id]?.[dateKey];
                      const workHours = calculateWorkHours(record || {});
                      const dailyPay = calculateDailyPay(emp, record || {});
                      
                      return (
                        <React.Fragment key={emp.id}>
                          {['clockIn', 'breakStart1', 'breakEnd1', 'breakStart2', 'breakEnd2', 'clockOut'].map(field => (
                            <td
                              key={field}
                              className={`p-1 border text-center text-xs cursor-pointer hover:bg-blue-50 ${record?.isHoliday && field === 'clockIn' ? 'bg-purple-100' : ''}`}
                              onClick={() => setEditingTime({ employeeId: emp.id, dateKey, field, value: record?.[field] || '' })}
                            >
                              {editingTime?.employeeId === emp.id && editingTime?.dateKey === dateKey && editingTime?.field === field ? (
                                <input
                                  type="time"
                                  defaultValue={editingTime.value}
                                  onBlur={(e) => editTime(emp.id, dateKey, field, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') editTime(emp.id, dateKey, field, e.target.value);
                                    if (e.key === 'Escape') setEditingTime(null);
                                  }}
                                  autoFocus
                                  className="w-full p-1 border rounded"
                                />
                              ) : (
                                record?.[field] || '-'
                              )}
                            </td>
                          ))}
                          <td className="p-1 border text-center text-xs font-medium">
                            {workHours > 0 ? `${workHours.toFixed(1)}h` : '-'}
                          </td>
                          <td className="p-1 border text-center text-xs font-medium">
                            {dailyPay.total > 0 ? `¥${Math.round(dailyPay.total).toLocaleString()}` : '-'}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}
              {/* Monthly Totals */}
              <tr className="bg-blue-50 font-bold">
                <td className="p-2 border sticky left-0 bg-blue-50">合計</td>
                {employees.map(emp => {
                  const totals = calculateMonthlyTotals(emp.id);
                  return (
                    <React.Fragment key={emp.id}>
                      <td colSpan="6" className="p-2 border text-xs"></td>
                      <td className="p-2 border text-center text-xs">{totals.hours.toFixed(1)}h</td>
                      <td className="p-2 border text-center text-xs">¥{Math.round(totals.total).toLocaleString()}</td>
                    </React.Fragment>
                  );
                })}
              </tr>
              {/* Detailed breakdown */}
              <tr className="bg-gray-50">
                <td className="p-2 border sticky left-0 bg-gray-50">詳細</td>
                {employees.map(emp => {
                  const totals = calculateMonthlyTotals(emp.id);
                  return (
                    <td key={emp.id} colSpan="8" className="p-2 border text-xs">
                      <div className="space-y-1">
                        <div>基本給: ¥{Math.round(totals.basePay).toLocaleString()}</div>
                        <div>超過分(25%): ¥{Math.round(totals.overtimePay).toLocaleString()}</div>
                        <div>休日出勤(35%): ¥{Math.round(totals.holidayPay).toLocaleString()}</div>
                        <div>交通費: ¥{totals.transport.toLocaleString()}</div>
                        <div className="font-bold">総合計: ¥{Math.round(totals.total).toLocaleString()}</div>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => exportToCSV(emp.id)}
                            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-xs flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            CSV
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPayslipEmployee(emp.id);
                              setShowPayslipModal(true);
                            }}
                            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3" />
                            給与明細
                          </button>
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const EmployeeForm = ({ employee = null, onSave, onCancel }) => {
    const [name, setName] = useState(employee?.name || '');
    const [hourlyRate, setHourlyRate] = useState(employee?.hourlyRate || '');
    const [transportAllowance, setTransportAllowance] = useState(employee?.transportAllowance || '');

    return (
      <div className="flex items-center gap-3 flex-1">
        <input
          type="text"
          placeholder="氏名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="p-2 border rounded flex-1"
        />
        <input
          type="number"
          placeholder="時給"
          value={hourlyRate}
          onChange={(e) => setHourlyRate(e.target.value)}
          className="p-2 border rounded w-24"
        />
        <input
          type="number"
          placeholder="交通費"
          value={transportAllowance}
          onChange={(e) => setTransportAllowance(e.target.value)}
          className="p-2 border rounded w-24"
        />
        <button
          onClick={() => onSave(name, hourlyRate, transportAllowance)}
          className="p-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          <Save className="w-4 h-4" />
        </button>
        <button
          onClick={onCancel}
          className="p-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const AddEmployeeForm = ({ onSave, onCancel }) => {
    const [name, setName] = useState('');
    const [hourlyRate, setHourlyRate] = useState('');
    const [transportAllowance, setTransportAllowance] = useState('');

    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">氏名</label>
          <input
            type="text"
            placeholder="山田太郎"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">時給（円）</label>
          <input
            type="number"
            placeholder="1500"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">交通費（円）</label>
          <input
            type="number"
            placeholder="500"
            value={transportAllowance}
            onChange={(e) => setTransportAllowance(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            キャンセル
          </button>
          <button
            onClick={() => onSave(name, hourlyRate, transportAllowance)}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            追加
          </button>
        </div>
      </div>
    );
  };

  // Printable Payslip Component
  const PayslipModal = ({ employeeId, onClose }) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return null;

    const totals = calculateMonthlyTotals(employeeId);
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    const workDays = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const record = attendanceData[employeeId]?.[dateKey];
      if (record && record.clockIn) {
        const workHours = calculateWorkHours(record);
        const dailyPay = calculateDailyPay(employee, record);
        workDays.push({ day, record, workHours, dailyPay });
      }
    }

    const handlePrint = () => {
      window.print();
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Print button - hidden when printing */}
          <div className="p-4 border-b flex justify-between items-center print:hidden">
            <h3 className="text-xl font-bold">給与明細書</h3>
            <div className="flex gap-2">
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                印刷
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                閉じる
              </button>
            </div>
          </div>

          {/* A4 Printable Content */}
          <div className="p-8" style={{ minHeight: '297mm' }}>
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">給与明細書</h1>
              <p className="text-xl">{currentYear}年{currentMonth + 1}月分</p>
            </div>

            {/* Employee Info */}
            <div className="mb-8 border-2 border-gray-300 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">氏名</p>
                  <p className="text-xl font-bold">{employee.name} 様</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">発行日</p>
                  <p className="text-lg">{new Date().toLocaleDateString('ja-JP')}</p>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-4 border-b-2 border-gray-300 pb-2">給与内訳</h2>
              <table className="w-full border-collapse">
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 px-4 text-lg">基本給</td>
                    <td className="py-2 px-4 text-right text-lg">¥{Math.round(totals.basePay).toLocaleString()}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 text-lg">時間外手当（25%割増）</td>
                    <td className="py-2 px-4 text-right text-lg">¥{Math.round(totals.overtimePay).toLocaleString()}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 text-lg">休日出勤手当（35%割増）</td>
                    <td className="py-2 px-4 text-right text-lg">¥{Math.round(totals.holidayPay).toLocaleString()}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 text-lg">交通費</td>
                    <td className="py-2 px-4 text-right text-lg">¥{totals.transport.toLocaleString()}</td>
                  </tr>
                  <tr className="border-b-4 border-gray-400">
                    <td className="py-2 px-4 text-lg">合計労働時間</td>
                    <td className="py-2 px-4 text-right text-lg font-bold">{totals.hours.toFixed(1)}時間</td>
                  </tr>
                  <tr className="bg-blue-50">
                    <td className="py-3 px-4 text-xl font-bold">総支給額</td>
                    <td className="py-3 px-4 text-right text-2xl font-bold">¥{Math.round(totals.total).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Work Details */}
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-4 border-b-2 border-gray-300 pb-2">勤怠詳細</h2>
              <div className="text-sm">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2">日付</th>
                      <th className="border p-2">出勤</th>
                      <th className="border p-2">退勤</th>
                      <th className="border p-2">休憩</th>
                      <th className="border p-2">労働時間</th>
                      <th className="border p-2">日給</th>
                      <th className="border p-2">備考</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workDays.map(({ day, record, workHours, dailyPay }) => {
                      const breaks = [];
                      if (record.breakStart1 && record.breakEnd1) {
                        breaks.push(`${record.breakStart1}-${record.breakEnd1}`);
                      }
                      if (record.breakStart2 && record.breakEnd2) {
                        breaks.push(`${record.breakStart2}-${record.breakEnd2}`);
                      }
                      
                      return (
                        <tr key={day}>
                          <td className="border p-2 text-center">{day}日</td>
                          <td className="border p-2 text-center">{record.clockIn}</td>
                          <td className="border p-2 text-center">{record.clockOut}</td>
                          <td className="border p-2 text-center text-xs">{breaks.join(', ') || '-'}</td>
                          <td className="border p-2 text-center">{workHours.toFixed(1)}h</td>
                          <td className="border p-2 text-right">¥{Math.round(dailyPay.total).toLocaleString()}</td>
                          <td className="border p-2 text-center text-xs">{record.isHoliday ? '休日出勤' : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 text-sm text-gray-600">
              <p>※この給与明細書は労働基準法に基づき、5年間保管してください。</p>
              <p>※時間外労働（8時間超過）は25%割増、休日出勤は35%割増にて計算されています。</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-content, .print-content * {
            visibility: visible;
          }
          .print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 210mm;
            min-height: 297mm;
          }
          @page {
            size: A4;
            margin: 15mm;
          }
        }
      `}</style>

      {/* Navigation */}
      <div className="bg-white shadow-md">
        <div className="container mx-auto px-4">
          <div className="flex gap-4 py-4">
            <button
              onClick={() => setCurrentView('clock')}
              className={`px-6 py-2 rounded-lg font-medium ${
                currentView === 'clock' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              <Clock className="w-4 h-4 inline mr-2" />
              打刻
            </button>
            <button
              onClick={() => setCurrentView('admin')}
              className={`px-6 py-2 rounded-lg font-medium ${
                currentView === 'admin' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              管理
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {currentView === 'clock' ? <ClockView /> : <AdminView />}

      {/* Add Employee Modal */}
      {showAddEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-xl font-bold mb-4">従業員を追加</h3>
            <AddEmployeeForm
              onSave={(name, rate, transport) => addEmployee(name, rate, transport)}
              onCancel={() => setShowAddEmployee(false)}
            />
          </div>
        </div>
      )}

      {/* Payslip Modal */}
      {showPayslipModal && selectedPayslipEmployee && (
        <div className="print-content">
          <PayslipModal
            employeeId={selectedPayslipEmployee}
            onClose={() => {
              setShowPayslipModal(false);
              setSelectedPayslipEmployee(null);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default AttendanceSystem;