const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

exports.inspection = async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1, D2 } = req.body;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);

  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001', ${CERTDT}, ${ID})`;
  const { recordset: RcvNos } = await pool.request().query`SELECT RcvNo FROM GRCV_CT WHERE (RcvNo = ${RCVNO})`;
  const RcvNo = RcvNos.map(({ RcvNo }) => RcvNo)[0];

  const { type } = req.params;

  try {
    if (type === 'save') {
      // 임시저장 시 GRCV_CT 테이블에 데이터 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET CERT_NO = ${CERTNO[0]['']}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'C')
      `;
    } else {
      // complete -> 검사완료 시 GRCV_CT 테이블에 데이터 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'C')
      `;
    }

    // GSVC 테이블에 데이터 삽입
    await pool.request().query`
      merge into GSVC_C_H
      using(values (1))
        as Source (Number)
        on (CERTNO = ${CERTNO[0]['']})
      when matched then
        update set UP_ID = ${ID}, UP_DT = GetDate()
      when not matched then
        insert (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) values(${CERTNO[0]['']}, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});
      `;

    Object.values(D1).forEach(async (v, i) => {
      await pool.request().query`
        merge into GSVC_C_D1
        using(values (1))
          as Source (Number)
          on (CERTNO = ${CERTNO[0]['']} and CERTSEQ = ${i + 1})
        when matched and (Value != ${v}) then
          update set Value = ${v}, UP_ID = ${ID}, UP_DT = GetDate()
        when not matched then
          insert (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) values(${CERTNO[0]['']}, ${i + 1}, ${v}, ${ID}, ${ID});
      `;
    });

    Object.values(D2).forEach(async (v, i) => {
      await pool.request().query`merge into GSVC_C_D2
        using(values (1))
          as Source (Number)
          on (CERTNO = ${CERTNO[0]['']} and CERTSEQ = ${i + 1})
        when matched and (CarriedOut != ${v.carriedOut.toString()} or NotCarried != ${v.notCarried.toString()} or NotApp != ${v.notApplicable.toString()} or Comm != ${
        v.Comm
      }) then
          update set CarriedOut = ${v.carriedOut}, NotCarried = ${v.notCarried}, NotApp = ${v.notApplicable}, Comm = ${
        v.Comm
      }, UP_ID = ${ID}, UP_DT = GetDate()
        when not matched then
          insert (CERTNO, CERTSEQ, CarriedOut, NotCarried, NotApp, Comm, IN_ID, UP_ID) values(${CERTNO[0]['']}, ${i + 1}, ${v.carriedOut}, ${
        v.notCarried
      }, ${v.notApplicable}, ${v.Comm}, ${ID}, ${ID});
      `;
    });

    res.status(200).send();
  } catch (e) {
    console.error(e);
    res.status(500).send();
  }
};