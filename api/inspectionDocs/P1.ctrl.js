const sql = require('mssql');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const config = require('../../lib/configDB');

exports.details = async (req, res) => {
  const { ct } = req.query;

  try {
    const pool = await sql.connect(config);

    const { recordset: D1 } = await pool.request().query`
        SELECT ProductType, Qty, Size, Perform FROM GSVC_P1_D1
        WHERE CERTNO = ${ct}
      `;
    const { recordset: D2 } = await pool.request().query`
        SELECT Value FROM GSVC_P1_D2
        WHERE CERTNO = ${ct}
    `;

    const D1arr = D1.map(({ ProductType, Qty, Size, Perform }, i) => ({
      [i]: {
        ProductType,
        Qty,
        Size,
        Perform,
      },
    }));
    const D1obj = D1arr.reduce((a, c) => ({ ...a, ...c }), {});

    res.json({
      D1: D1obj,
      D2: D2[0].Value,
    });
  } catch (e) {
    console.log(e);
    res.status(500).send();
  }
};

exports.inspection = async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1, D2 } = req.body;
  const { type } = req.params;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);

  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001', ${CERTDT}, ${ID})`;

  try {
    jwt.verify(token, process.env.JWT_SECRET);

    const { recordset: magamYn } = await pool.request().query`
    SELECT MagamYn FROM GRCV_CT
    WHERE (RcvNo = ${RCVNO} AND Doc_No = 'P1')
  `;

    if (!magamYn[0].MagamYn) {
      await pool.request().query`
      INSERT GDOC_3 (Cert_NO, Doc_No, Doc_Seq, Seq, IN_ID, UP_ID)
      VALUES (${CERTNO[0]['']}, 'P1', 1, 1, ${ID}, ${ID})
    `;
    }

    if (type === 'save') {
      await pool.request().query`
        UPDATE GRCV_CT SET CERT_NO = ${H.CERTNO || CERTNO[0]['']}, MagamYn = 0, MagamDt = '', UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RCVNO} AND Doc_No = 'P1')
      `;
    } else {
      await pool.request().query`
        UPDATE GRCV_CT SET Cert_No = ${H.CERTNO || CERTNO[0]['']}, MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RCVNO} AND Doc_No = 'P1')
      `;
    }

    await pool.request().query`
      MERGE INTO GSVC_P1_H
        USING (values (1)) AS Source (Number)
        ON (CERTNO = ${H.CERTNO})
      WHEN MATCHED THEN
        UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTDT, ShipNm, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});

      MERGE INTO GSVC_P1_D2
        USING (values (1)) AS Source (Number)
        ON (CERTNO = ${H.CERTNO})
      WHEN MATCHED THEN
        UPDATE SET Value = ${D2}, UP_ID = ${ID}, UP_DT = getDate()
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, 1, ${D2}, ${ID}, ${ID});
    `;

    let insertDt = moment().format('YYYY-MM-DD HH:mm:ss');

    if (H.CERTNO) {
      const { recordset: insertInfo } = await pool.request().query`
        SELECT IN_DT FROM GSVC_P1_D1
        WHERE (CERTNO = ${H.CERTNO} AND CERTSEQ = 1)
      `;

      insertDt = insertInfo[0].IN_DT;

      await pool.request().query`
        SELECT * FROM GSVC_P1_D1 WHERE CERTNO = ${H.CERTNO}

        BEGIN TRAN
        DELETE FROM GSVC_P1_D1 WHERE CERTNO = ${H.CERTNO}
        SELECT * FROM GSVC_P1_D1 WHERE CERTNO = ${H.CERTNO}
        COMMIT TRAN
      `;
    }

    Object.values(D1).forEach(async (v, i) => {
      await pool.request().query`
        INSERT GSVC_P1_D1 (CERTNO, CERTSEQ, ProductType, Qty, Size, Perform, IN_ID, IN_DT, UP_ID)
        VALUES (${H.CERTNO || CERTNO[0]['']}, ${i + 1}, ${v.ProductType}, ${v.Qty}, ${v.Size}, ${v.Perform}, ${ID}, ${insertDt}, ${ID});
      `;
    });

    res.status(200).send();
  } catch (e) {
    console.error(e);
    if (e.name === 'TokenExpiredError') {
      return res.status(419).json({ code: 419, message: '토큰이 만료되었습니다.' });
    }
    if (e.name === 'JsonWebTokenError') {
      return res.status(401).json({ code: 401, message: '유효하지 않은 토큰입니다.' });
    }
    res.status(500).send();
  }
};
