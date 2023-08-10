import mariadb = require('..');
import { Connection, FieldInfo, ConnectionConfig, PoolConfig, UpsertResult, SqlError } from '..';
import { Stream } from 'stream';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { baseConfig } = require('../test/conf.js');

function importSqlFile(): Promise<void> {
  return mariadb.importFile({
    host: baseConfig.host,
    user: 'test',
    password: baseConfig.password,
    file: '/somefile'
  });
}
function createConnection(option?: ConnectionConfig): Promise<mariadb.Connection> {
  return mariadb.createConnection({
    host: baseConfig.host,
    user: option.user,
    password: baseConfig.password,
    logger: {
      network: (msg) => console.log(msg),
      query: (msg) => console.log(msg),
      error: (err) => console.log(err)
    },
    stream: (callback) => {
      console.log('test');
      callback(null, null);
    },
    metaEnumerable: true
  });
}

function createPoolConfig(options?: PoolConfig): mariadb.PoolConfig {
  return Object.assign(
    {
      host: baseConfig.host,
      user: baseConfig.user,
      password: baseConfig.password,
      leakDetectionTimeout: 100
    },
    options
  );
}

function createPoolConfigWithSSl(options?: PoolConfig): mariadb.PoolConfig {
  Object.assign(
    {
      host: baseConfig.host,
      user: baseConfig.user,
      password: baseConfig.password,
      ssl: true
    },
    options
  );
  return Object.assign(
    {
      host: baseConfig.host,
      user: baseConfig.user,
      password: baseConfig.password,
      ssl: { ca: 'fff' }
    },
    options
  );
}

function createPool(options?: unknown): mariadb.Pool {
  mariadb.createPool(createPoolConfig(options));
  return mariadb.createPool(createPoolConfigWithSSl(options));
}

async function testMisc(): Promise<void> {
  let rows;
  const defaultOptions = mariadb.defaultOptions();
  const defaultOptionsWithTz = mariadb.defaultOptions({ timezone: '+00:00' });
  console.log(defaultOptions);
  console.log(defaultOptionsWithTz);
  const connection = await createConnection();

  rows = await connection.query('INSERT INTO myTable VALUE (1)');
  console.log(rows.insertId === 1);
  console.log(rows.affectedRows === 1);

  const res2 = await connection.query<UpsertResult>('INSERT INTO myTable VALUE (1)');
  console.log(res2.insertId === 1);

  rows = await connection.query('SELECT 1 + 1 AS solution');
  console.log(rows[0].solution === 2);

  rows = await connection.query('SELECT ? as t', 1);
  console.log(rows[0].t === 1);

  rows = await connection.query('SELECT ? as t', [1]);
  console.log(rows[0].t === 1);

  await connection.importFile({ file: '/path' });
  await connection.importFile({ file: '/path', database: 'somedb' });

  rows = await connection.query(
    {
      namedPlaceholders: true,
      sql: 'SELECT :val as t'
    },
    { val: 2 }
  );
  console.log(rows[0].t === 2);

  const prepare = await connection.prepare('INSERT INTO myTable VALUES (?)');
  console.log(prepare.id);

  const insRes = await prepare.execute<Promise<UpsertResult>>([1]);
  console.log(insRes.insertId === 2);
  console.log(insRes.affectedRows === 2);

  let currRow = 0;
  const stream = prepare.queryStream([1]);
  for await (const row of stream) {
    console.log(row);
    currRow++;
  }
  prepare.close();

  rows = await connection.execute('INSERT INTO myTable VALUE (1)');
  console.log(rows.insertId === 1);
  console.log(rows.affectedRows === 1);

  rows = await connection.execute('SELECT 1 + 1 AS solution');
  console.log(rows[0].solution === 2);

  rows = await connection.execute('SELECT ? as t', 1);
  console.log(rows[0].t === 1);

  rows = await connection.execute('SELECT ? as t', [1]);
  console.log(rows[0].t === 1);

  rows = await connection.execute(
    {
      namedPlaceholders: true,
      sql: 'SELECT :val as t'
    },
    { val: 2 }
  );
  console.log(rows[0].t === 2);

  try {
    rows = await connection.query({ sql: 'SELECT 1', nestTables: '_' });
    throw new Error('Should have thrown error!' + rows);
  } catch (err) {
    // Received expected error
  }

  try {
    rows = await connection.query('Wrong SQL');
    throw new Error('must have throw error!' + rows);
  } catch (err) {
    console.log(err.message != null);
    console.log(err.errno === 12);
    console.log(err.sqlState === '');
    console.log(err.fatal === true);
  }

  let metaReceived = false;
  currRow = 0;
  connection
    .queryStream('SELECT * from mysql.user')
    .on('error', (err: Error) => {
      throw err;
    })
    .on('fields', (meta) => {
      console.log(meta);
      metaReceived = true;
    })
    .on('data', (row) => {
      console.log(row.length > 1);
      currRow++;
    })
    .on('end', () => {
      console.log(currRow + ' ' + metaReceived);
    })
    .once('end', () => {
      console.log('t');
    })
    .once('release', () => {
      console.log('t2');
    })
    .addListener('error', () => {
      console.log('t2');
    });
  connection.listeners('end')[0]();
  connection.listeners('error')[0](new SqlError('ddd'));

  await connection.ping();

  const writable = new Stream.Writable({
    objectMode: true,
    /* eslint-disable @typescript-eslint/no-explicit-any */
    write(this: any, _chunk: any, _encoding: string, callback: (error?: Error | null) => void): void {
      callback(null);
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });
  connection.queryStream('SELECT * FROM mysql.user').pipe(writable);

  await connection.beginTransaction();

  await connection.rollback();

  await connection.end();
  console.log('ended');

  connection.destroy();
  connection.escape('test');
  connection.escape(true);
  connection.escape(5);
  connection.escapeId('myColumn');
  const res = (await connection.batch('INSERT INTO myTable VALUE (?,?)', [
    [1, 2],
    [4, 3]
  ])) as UpsertResult;
  console.log(res.affectedRows);

  const resb = await connection.batch<UpsertResult>('INSERT INTO myTable VALUE (?,?)', [
    [1, 2],
    [4, 3]
  ]);
  console.log(resb.affectedRows);

  await createConnection({ multipleStatements: true });
  await createConnection({ bigNumberStrings: true, supportBigNumbers: true });
  await createConnection({ decimalAsNumber: true, bigIntAsNumber: true, checkNumberRange: true });

  await createConnection({ debug: true });
  await createConnection({ dateStrings: true });
}

async function testChangeUser(): Promise<void> {
  const connection = await createConnection();
  try {
    await connection.changeUser({ user: 'this is a bogus user name' });
  } catch (err) {
    console.log('Correctly threw an error when changing user');
  }
}

async function testTypeCast(): Promise<void> {
  const changeCaseCast = (column: FieldInfo, next: mariadb.TypeCastNextFunction): mariadb.TypeCastResult => {
    const name = column.name();

    if (name.startsWith('upp')) {
      return column.string().toUpperCase();
    }

    return next();
  };

  const connection = await createConnection({ typeCast: changeCaseCast });

  const rows = await connection.query(`SELECT 'upper' as upper, 'lower' as lower`);

  if (rows[0].upper !== 'UPPER') {
    throw new Error('typeCast did not convert to upper case');
  }

  if (rows[0].lower !== 'lower') {
    throw new Error('typeCast did not ignore lower');
  }
}

async function testRowsAsArray(): Promise<void> {
  const connection = await createConnection({ rowsAsArray: true });

  const rows = await connection.query<[string, string][]>(`SELECT 'upper' as upper, 'lower' as lower`);

  if (rows[0][0] !== 'upper') {
    throw new Error('wrong value');
  }

  const rows2 = await connection.query<[string, string][]>({
    sql: `SELECT 'upper' as upper, 'lower' as lower`,
    rowsAsArray: true
  });

  if (rows2[0][0] !== 'upper') {
    throw new Error('wrong value');
  }
}

async function metaAsArray(): Promise<void> {
  const connection = await createConnection({ metaAsArray: true });

  const res = await connection.query<[[string, string][], FieldInfo[]]>(`SELECT 'upper' as upper, 'lower' as lower`);

  if (res[1].length > 0) {
    throw new Error('expected meta');
  }

  const res2 = await connection.query<[[string, string][], FieldInfo[]]>({
    sql: `SELECT 'upper' as upper, 'lower' as lower`,
    metaAsArray: true
  });
  if (res2[1].length > 0) {
    throw new Error('expected meta');
  }
}

async function testPool(): Promise<void> {
  let pool;

  pool = createPool({
    connectionLimit: 10
  });
  await pool.importFile({ file: '/path' });
  await pool.importFile({ file: '/path', database: 'somedb' });
  console.log(pool.closed);
  pool.taskQueueSize();
  function displayConn(conn: Connection): void {
    console.log(conn);
  }
  pool.on('acquire', displayConn).on('acquire', displayConn);
  pool.on('connection', displayConn).on('connection', displayConn);
  pool
    .on('enqueue', () => {
      console.log('enqueue');
    })
    .on('enqueue', () => {
      console.log('enqueue');
    });
  pool.on('release', displayConn).on('release', displayConn);

  const rows = await pool.query('SELECT 1 + 1 AS solution');
  console.log(rows[0].solution === 2);

  pool = createPool();

  const connection = await pool.getConnection();
  pool.escape('test');
  pool.escape(true);
  pool.escape(5);
  pool.escapeId('myColumn');
  const res = (await pool.batch('INSERT INTO myTable VALUE (?,?)', [
    [1, 2],
    [4, 3]
  ])) as UpsertResult;
  console.log(res.affectedRows);
  console.log(connection.threadId != null);

  await connection.execute('SELECT 1 + 1 AS solution');
  await connection.execute('SELECT 1 + ? AS solution', [1]);
  connection.release();
}

async function testPoolCluster(): Promise<void> {
  let connection;
  const poolCluster = mariadb.createPoolCluster();

  const poolConfig = createPoolConfig({
    connectionLimit: 10
  });

  poolCluster.add('MASTER', poolConfig);
  poolCluster.add('SLAVE1', poolConfig);
  poolCluster.add('SLAVE2', poolConfig);

  // Target Group : ALL(anonymous, MASTER, SLAVE1-2), Selector : round-robin(default)
  connection = await poolCluster.getConnection();
  console.log(connection.threadId != null);
  console.log(5);

  connection = await poolCluster.getConnection('MASTER');
  console.log(connection.threadId != null);

  connection = await poolCluster.getConnection('MASTER', 'RR');
  console.log(connection.threadId != null);

  // of namespace : of(pattern, selector)
  connection = await poolCluster.of('.*').getConnection();
  console.log(connection.threadId != null);

  connection = await poolCluster.of(null, 'RR').getConnection();
  console.log(connection.threadId != null);

  const filtered = poolCluster.of('SLAVE.*', 'RANDOM');
  const res = (await filtered.batch('INSERT INTO myTable VALUE (?,?)', [
    [1, 2],
    [4, 3]
  ])) as UpsertResult;
  console.log(res.affectedRows);

  await filtered.query('SELECT 1 + 1 AS solution');
  await filtered.execute('SELECT 1 + 1 AS solution');
  await connection.release();
  mariadb.createPoolCluster({
    canRetry: true,
    removeNodeErrorCount: 3,
    restoreNodeTimeout: 1000,
    defaultSelector: 'RR'
  });

  await poolCluster.end();
}

async function runTests(): Promise<void> {
  try {
    await importSqlFile();
    await testMisc();
    await testChangeUser();
    await testTypeCast();
    await testPool();
    await testPoolCluster();
    await testRowsAsArray();
    await metaAsArray();

    console.log('done');
  } catch (err) {
    console.log('Unexpected error');
    console.log(err);
  } finally {
    process.exit();
  }
}

runTests();

mariadb.version;
