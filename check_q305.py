# -*- coding: utf-8 -*-
import json, sys, os, openpyxl
sys.stdout.reconfigure(encoding='utf-8')

# 1. Check question 305 in generated questions.js
print("=== questions.js 中的第305题 ===")
with open(r'd:\code_test\quiz-app\questions.js', 'r', encoding='utf-8') as f:
    content = f.read()
data = json.loads(content.replace('const QUESTIONS = ', '').rstrip(';\n'))
for q in data:
    if q['id'] == 305:
        print(f"ID: {q['id']}")
        print(f"Type: {q['type']} ({q['typeName']})")
        print(f"Question: {q['question']}")
        for o in q['options']:
            print(f"  {o['key']}: {o['text']}")
        print(f"Answer: {q['answer']}")
        print(f"Category: {q.get('category', '')}")
        print(f"Uncertain: {q.get('uncertain', False)}")
        break

# 2. Check question 305 in the original Excel file
print("\n=== Excel原文件中的第305题 ===")
desktop = os.path.join(os.environ['USERPROFILE'], 'Desktop')
source_path = os.path.join(desktop, '2026新题库0316（答案不确定标黄）.xlsx')
wb = openpyxl.load_workbook(source_path, read_only=True)
ws = wb.active
# ID is in column 2, find row where ID = 305
for r in range(2, ws.max_row + 1):
    cell_id = ws.cell(r, 2).value
    if cell_id and int(cell_id) == 305:
        print(f"Row: {r}")
        print(f"Category: {ws.cell(r, 1).value}")
        print(f"ID: {ws.cell(r, 2).value}")
        print(f"Type: {ws.cell(r, 3).value}")
        print(f"Question: {ws.cell(r, 4).value}")
        print(f"A: {ws.cell(r, 5).value}")
        print(f"B: {ws.cell(r, 6).value}")
        print(f"C: {ws.cell(r, 7).value}")
        print(f"D: {ws.cell(r, 8).value}")
        print(f"Answer: {ws.cell(r, 9).value}")
        print(f"Mark: {ws.cell(r, 10).value}")
        break
wb.close()

# 3. Check if the copy file (副本) has a different answer
copy_files = [f for f in os.listdir(desktop) if '副本' in f and '2026' in f and '0316' in f and f.endswith('.xlsx') and not f.startswith('~')]
if copy_files:
    copy_path = os.path.join(desktop, copy_files[0])
    print(f"\n=== 副本文件中的第305题 ({copy_files[0]}) ===")
    wb2 = openpyxl.load_workbook(copy_path, read_only=True)
    ws2 = wb2.active
    # Check header to understand column layout
    header = [ws2.cell(1, c).value for c in range(1, 15)]
    print(f"Header: {header}")
    for r in range(2, ws2.max_row + 1):
        # Try to find ID=305 - check which column has the ID
        cell_id = ws2.cell(r, 2).value
        if cell_id and str(cell_id).strip() == '305':
            print(f"Row: {r}")
            for c in range(1, 11):
                print(f"  Col{c}: {ws2.cell(r, c).value}")
            break
    wb2.close()
else:
    print("\n没有找到副本文件")
