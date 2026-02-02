                        {/* 🆕 データ連携（CSV出力） */}
                        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                        📊 データ連携（CSV出力）
                                    </h2>
                                    <p className="text-sm text-gray-600 mt-1">弥生会計などの会計ソフトに連携するためのCSVファイルを出力</p>
                                </div>
                                <button
                                    onClick={() => setShowDataExport(!showDataExport)}
                                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                                >
                                    {showDataExport ? '閉じる' : '設定を開く'}
                                </button>
                            </div>

                            {showDataExport && (
                                <div className="space-y-6 border-t pt-4">
                                    {/* 期間選択 */}
                                    <div className="border-l-4 border-blue-500 pl-4">
                                        <h3 className="text-lg font-bold mb-3">出力期間を選択</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium mb-2">開始日</label>
                                                <input
                                                    type="date"
                                                    value={exportStartDate}
                                                    onChange={(e) => setExportStartDate(e.target.value)}
                                                    className="w-full p-2 border rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium mb-2">終了日</label>
                                                <input
                                                    type="date"
                                                    value={exportEndDate}
                                                    onChange={(e) => setExportEndDate(e.target.value)}
                                                    className="w-full p-2 border rounded-lg"
                                                />
                                            </div>
                                        </div>
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                onClick={() => {
                                                    const now = new Date();
                                                    setExportStartDate(`${now.getFullYear()}-01-01`);
                                                    setExportEndDate(`${now.getFullYear()}-12-31`);
                                                }}
                                                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
                                            >
                                                今年度（1/1〜12/31）
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const now = new Date();
                                                    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                                                    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                                                    setExportStartDate(firstDay.toISOString().split('T')[0]);
                                                    setExportEndDate(lastDay.toISOString().split('T')[0]);
                                                }}
                                                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
                                            >
                                                今月
                                            </button>
                                        </div>
                                    </div>

                                    {/* CSV出力ボタン */}
                                    <div className="border-l-4 border-green-500 pl-4">
                                        <h3 className="text-lg font-bold mb-3">CSVファイルを出力</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <button
                                                onClick={exportSalesCSV}
                                                className="p-4 bg-green-500 text-white rounded-lg hover:bg-green-600 text-left"
                                            >
                                                <div className="font-bold text-lg mb-1">💰 売上データ</div>
                                                <div className="text-sm opacity-90">注文履歴から売上を出力</div>
                                            </button>
                                            <button
                                                onClick={exportExpensesCSV}
                                                className="p-4 bg-red-500 text-white rounded-lg hover:bg-red-600 text-left"
                                            >
                                                <div className="font-bold text-lg mb-1">💸 支出データ</div>
                                                <div className="text-sm opacity-90">経費・仕入などの支出を出力</div>
                                            </button>
                                            <button
                                                onClick={exportPayrollCSV}
                                                className="p-4 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-left"
                                            >
                                                <div className="font-bold text-lg mb-1">👥 人件費データ</div>
                                                <div className="text-sm opacity-90">従業員の給与・社会保険料を出力</div>
                                            </button>
                                            <button
                                                onClick={exportEmployeesCSV}
                                                className="p-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-left"
                                            >
                                                <div className="font-bold text-lg mb-1">📋 従業員一覧</div>
                                                <div className="text-sm opacity-90">従業員マスタを出力</div>
                                            </button>
                                        </div>
                                    </div>

                                    {/* 出力形式の説明 */}
                                    <div className="bg-blue-50 p-4 rounded-lg">
                                        <div className="font-bold mb-2">📌 CSV形式について</div>
                                        <div className="text-sm text-gray-700 space-y-1">
                                            <p>• <strong>売上データ:</strong> 日付, 注文番号, テーブル, 合計金額, 税率8%売上, 税率10%売上, 内訳</p>
                                            <p>• <strong>支出データ:</strong> 日付, 項目, 金額, カテゴリ, 備考</p>
                                            <p>• <strong>人件費データ:</strong> 年月, 従業員名, 従業員番号, 総支給額, 健康保険, 厚生年金, 雇用保険, 所得税, 住民税, 手取額</p>
                                            <p>• <strong>従業員一覧:</strong> 従業員番号, 氏名, 時給/月給, 入社日, ステータス</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
