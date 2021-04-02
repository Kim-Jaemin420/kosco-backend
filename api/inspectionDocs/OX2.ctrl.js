const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

exports.inspection = async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1, D2, D3 } = req.body;
  const { type } = req.params;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);

  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001', ${CERTDT}, ${ID})`;
  const { recordset: RcvNos } = await pool.request().query`SELECT RcvNo FROM GRCV_CT WHERE (RcvNo = ${RCVNO})`;
  const RcvNo = RcvNos.map(({ RcvNo }) => RcvNo)[0];

  try {
    if (type === 'save') {
      console.log(1);
      await pool.request().query`
        UPDATE GRCV_CT SET CERT_NO = ${CERTNO[0]['']}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'OX2')
    `;
    } else {
      console.log(1);
      await pool.request().query`
        UPDATE GRCV_CT SET MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'OX2')
      `;
    }
    console.log(2);
    await pool.request().query`
      MERGE INTO GSVC_OX2_H
        USING (values (1)) AS Source (Number)
        ON (CERTNO IS NOT NULL)
      WHEN MATCHED THEN
        UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});
      
      MERGE INTO GSVC_OX2_D3
        USING (values (1)) AS Source (Number)
        ON (CERTNO = ${CERTNO[0]['']})
      WHEN MATCHED AND (Value != ${D3}) THEN
        UPDATE SET Value = ${D3}, UP_ID = ${ID}, UP_DT = getDate()
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, 1, ${D3}, ${ID}, ${ID});
    `;
    console.log(3);
    Object.values(D1).forEach(async (v, i) => {
      await pool.request().query`
        MERGE INTO GSVC_OX2_D1
          USING (values(1)) AS Source (Number)
          ON (CERTNO = ${CERTNO[0]['']} AND CERTSEQ = ${i + 1})
        WHEN MATCHED AND (SetNo1 != ${v.SetNo1} OR SetNo2 != ${v.SetNo2} OR SetNo3 != ${v.SetNo3} OR SetNo4 != ${v.SetNo4} OR SetNo5 != ${
        v.SetNo5
      } OR SetNo6 != ${v.SetNo6} OR SetNo7 != ${v.SetNo7} OR SetNo8 != ${v.SetNo8}) THEN
          UPDATE SET SetNo1 = ${v.SetNo1}, SetNo2 = ${v.SetNo2}, SetNo3 = ${v.SetNo3}, SetNo4 = ${v.SetNo4}, SetNo5 = ${v.SetNo5}, SetNo6 = ${
        v.SetNo6
      }, SetNo7 = ${v.SetNo7}, SetNo8 = ${v.SetNo8}, UP_ID = ${ID}, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTSEQ, SetNo1, SetNo2, SetNo3, SetNo4, SetNo5, SetNo6, SetNo7, SetNo8, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, 1, ${
        v.SetNo1
      }, ${v.SetNo2}, ${v.SetNo3}, ${v.SetNo4}, ${v.SetNo5}, ${v.SetNo6}, ${v.SetNo7}, ${v.SetNo8}, ${ID}, ${ID});
      `;
    });
    console.log(4);
    Object.values(D2).forEach(async (v, i) => {
      await pool.request().query`
        MERGE INTO GSVC_OX2_D2
          USING (values(1)) AS Source (Number)
          ON (CERTNO = ${CERTNO[0]['']} AND CERTSEQ = ${i + 1})
        WHEN MATCHED AND (Manuf != ${v.Manuf} OR Volume != ${v.Volume} OR WorkPress != ${v.WorkPress} OR SerialNo != ${
        v.SerialNo
      } OR TestDt != ${new Date(v.TestDt).toFormat('MMM.YY')} OR Perform != ${v.Perform}) THEN
          UPDATE SET Manuf = ${v.Manuf}, Volume = ${v.Volume}, WorkPress = ${v.WorkPress}, SerialNo = ${v.SerialNo}, TestDt = ${new Date(
        v.TestDt
      ).toFormat('MMM.YY')}, Perform = ${v.Perform}, IN_ID = ${ID}, UP_ID = ${ID}
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTSEQ, Manuf, Volume, WorkPress, SerialNo, TestDt, Perform, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, ${i + 1}, ${
        v.Manuf
      }, ${v.Volume}, ${v.WorkPress}, ${v.SerialNo}, ${new Date(v.TestDt).toFormat('MMM.YY')}, ${v.Perform}, ${ID}, ${ID});
      `;
    });

    res.status(200).send();
  } catch (e) {
    console.log(e);
    res.status(500).send();
  }
};
