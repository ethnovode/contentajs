## Features

_This section is still under development._

The main features of this project cover:

  - Automatic integration with the API exposed by your Contenta CMS install.
    Just provide the URL of the site and everything is taken care of for you.
  - Multi-threaded nodejs server that takes advantage of all the cores of the
    server's CPU.
  - A Subrequests server for request aggregation. Learn more about [subrequests](./.emdaer/docs/subrequests.md).
  - A [Redis](http://redis.io) integration. This comes with a connection pool to
    eliminate latency obtaining connections with the server.
  - Type safe development environment using [Flow](http://flow.org).